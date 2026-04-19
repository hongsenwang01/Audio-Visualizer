use rustfft::{num_complex::Complex, FftPlanner};
use serde::Serialize;
use std::{
    f32::consts::PI,
    ffi::c_void,
    ptr, slice, thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use windows::{
    core::{Result as WinResult, GUID},
    Win32::{
        Media::Audio::{
            eConsole, eRender, IAudioCaptureClient, IAudioClient, IMMDeviceEnumerator,
            MMDeviceEnumerator, AUDCLNT_BUFFERFLAGS_SILENT, AUDCLNT_SHAREMODE_SHARED,
            AUDCLNT_STREAMFLAGS_LOOPBACK, WAVEFORMATEX, WAVEFORMATEXTENSIBLE, WAVE_FORMAT_PCM,
        },
        System::Com::{
            CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_ALL,
            COINIT_MULTITHREADED,
        },
    },
};

const FRAME_BINS: usize = 96;
const FFT_SIZE: usize = 2048;
const WAVE_FORMAT_IEEE_FLOAT: u16 = 3;
const WAVE_FORMAT_EXTENSIBLE: u16 = 0xfffe;
const KSDATAFORMAT_SUBTYPE_PCM: GUID = GUID::from_u128(0x00000001_0000_0010_8000_00aa00389b71);
const KSDATAFORMAT_SUBTYPE_IEEE_FLOAT: GUID =
    GUID::from_u128(0x00000003_0000_0010_8000_00aa00389b71);

#[derive(Clone, Serialize)]
pub struct AudioFrame {
    pub bins: Vec<f32>,
    pub peak: f32,
    pub rms: f32,
    pub timestamp: u128,
}

#[derive(Clone, Copy)]
struct CaptureFormat {
    channels: usize,
    block_align: usize,
    sample_rate: u32,
    sample_format: SampleFormat,
}

#[derive(Clone, Copy)]
enum SampleFormat {
    Float32,
    Pcm16,
    Pcm24,
    Pcm32,
}

pub fn start_loopback_capture<F>(mut on_frame: F) -> thread::JoinHandle<()>
where
    F: FnMut(AudioFrame) + Send + 'static,
{
    thread::spawn(move || {
        if let Err(error) = run_loopback_capture(&mut on_frame) {
            eprintln!("WASAPI loopback capture stopped: {error:?}");
        }
    })
}

fn run_loopback_capture<F>(on_frame: &mut F) -> WinResult<()>
where
    F: FnMut(AudioFrame),
{
    unsafe {
        CoInitializeEx(None, COINIT_MULTITHREADED).ok()?;
    }

    let result = unsafe { capture_loop(on_frame) };

    unsafe {
        CoUninitialize();
    }

    result
}

unsafe fn capture_loop<F>(on_frame: &mut F) -> WinResult<()>
where
    F: FnMut(AudioFrame),
{
    let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
    let device = enumerator.GetDefaultAudioEndpoint(eRender, eConsole)?;
    let audio_client: IAudioClient = device.Activate(CLSCTX_ALL, None)?;
    let mix_format_ptr = audio_client.GetMixFormat()?;
    let capture_format = read_capture_format(mix_format_ptr);

    audio_client.Initialize(
        AUDCLNT_SHAREMODE_SHARED,
        AUDCLNT_STREAMFLAGS_LOOPBACK,
        10_000_000,
        0,
        mix_format_ptr,
        None,
    )?;

    CoTaskMemFree(Some(mix_format_ptr.cast::<c_void>()));

    let capture_client: IAudioCaptureClient = audio_client.GetService()?;
    let mut analyzer = AudioAnalyzer::new(capture_format.sample_rate);

    audio_client.Start()?;

    loop {
        let packet_frames = capture_client.GetNextPacketSize()?;

        if packet_frames == 0 {
            if analyzer.should_emit() {
                on_frame(analyzer.make_frame());
            }

            thread::sleep(Duration::from_millis(5));
            continue;
        }

        let mut data = ptr::null_mut();
        let mut frames_to_read = 0;
        let mut flags = 0;

        capture_client.GetBuffer(&mut data, &mut frames_to_read, &mut flags, None, None)?;

        let is_silent = flags & AUDCLNT_BUFFERFLAGS_SILENT.0 as u32 != 0;
        analyzer.push_packet(data, frames_to_read, is_silent, capture_format);
        capture_client.ReleaseBuffer(frames_to_read)?;

        if analyzer.should_emit() {
            on_frame(analyzer.make_frame());
        }
    }
}

unsafe fn read_capture_format(format_ptr: *const WAVEFORMATEX) -> CaptureFormat {
    let format = ptr::read_unaligned(format_ptr);
    let tag = format.wFormatTag;
    let bits = format.wBitsPerSample;
    let channels = usize::from(format.nChannels.max(1));
    let block_align = usize::from(format.nBlockAlign.max(1));
    let sample_rate = format.nSamplesPerSec.max(1);

    let sample_format = if tag == WAVE_FORMAT_EXTENSIBLE && format.cbSize >= 22 {
        let extensible = ptr::read_unaligned(format_ptr.cast::<WAVEFORMATEXTENSIBLE>());
        match extensible.SubFormat {
            KSDATAFORMAT_SUBTYPE_IEEE_FLOAT => SampleFormat::Float32,
            KSDATAFORMAT_SUBTYPE_PCM => pcm_sample_format(bits),
            _ => pcm_sample_format(bits),
        }
    } else if tag == WAVE_FORMAT_IEEE_FLOAT {
        SampleFormat::Float32
    } else if u32::from(tag) == WAVE_FORMAT_PCM {
        pcm_sample_format(bits)
    } else {
        pcm_sample_format(bits)
    };

    CaptureFormat {
        channels,
        block_align,
        sample_rate,
        sample_format,
    }
}

fn pcm_sample_format(bits: u16) -> SampleFormat {
    match bits {
        24 => SampleFormat::Pcm24,
        32 => SampleFormat::Pcm32,
        _ => SampleFormat::Pcm16,
    }
}

struct AudioAnalyzer {
    samples: Vec<f32>,
    sample_rate: u32,
    last_emit: Instant,
}

impl AudioAnalyzer {
    fn new(sample_rate: u32) -> Self {
        Self {
            samples: Vec::with_capacity(8192),
            sample_rate,
            last_emit: Instant::now(),
        }
    }

    unsafe fn push_packet(
        &mut self,
        data: *const u8,
        frames: u32,
        is_silent: bool,
        format: CaptureFormat,
    ) {
        if frames == 0 {
            return;
        }

        if is_silent || data.is_null() {
            self.samples
                .extend(std::iter::repeat_n(0.0, frames as usize));
            return;
        }

        let packet_len = frames as usize * format.block_align;
        let packet = slice::from_raw_parts(data, packet_len);
        let bytes_per_channel = (format.block_align / format.channels).max(1);

        for frame in 0..frames as usize {
            let frame_start = frame * format.block_align;
            let mut mixed = 0.0_f32;

            for channel in 0..format.channels {
                let sample_start = frame_start + channel * bytes_per_channel;
                mixed += read_sample(packet, sample_start, format.sample_format);
            }

            self.samples
                .push((mixed / format.channels as f32).clamp(-1.0, 1.0));
        }
    }

    fn should_emit(&self) -> bool {
        self.last_emit.elapsed() >= Duration::from_millis(33)
    }

    fn make_frame(&mut self) -> AudioFrame {
        let frame = analyze_samples_fft(&self.samples, self.sample_rate);
        self.samples.clear();
        self.last_emit = Instant::now();
        frame
    }
}

fn read_sample(packet: &[u8], offset: usize, format: SampleFormat) -> f32 {
    match format {
        SampleFormat::Float32 => {
            if offset + 4 > packet.len() {
                return 0.0;
            }
            f32::from_le_bytes(packet[offset..offset + 4].try_into().unwrap()).clamp(-1.0, 1.0)
        }
        SampleFormat::Pcm16 => {
            if offset + 2 > packet.len() {
                return 0.0;
            }
            i16::from_le_bytes(packet[offset..offset + 2].try_into().unwrap()) as f32 / 32768.0
        }
        SampleFormat::Pcm24 => {
            if offset + 3 > packet.len() {
                return 0.0;
            }
            let raw = ((packet[offset] as i32)
                | ((packet[offset + 1] as i32) << 8)
                | ((packet[offset + 2] as i32) << 16))
                << 8;
            (raw >> 8) as f32 / 8_388_608.0
        }
        SampleFormat::Pcm32 => {
            if offset + 4 > packet.len() {
                return 0.0;
            }
            i32::from_le_bytes(packet[offset..offset + 4].try_into().unwrap()) as f32
                / 2_147_483_648.0
        }
    }
}

fn analyze_samples_fft(samples: &[f32], sample_rate: u32) -> AudioFrame {
    if samples.is_empty() {
        return AudioFrame {
            bins: vec![0.0; FRAME_BINS],
            peak: 0.0,
            rms: 0.0,
            timestamp: now_millis(),
        };
    }

    let peak = samples
        .iter()
        .fold(0.0_f32, |current, sample| current.max(sample.abs()));
    let rms =
        (samples.iter().map(|sample| sample * sample).sum::<f32>() / samples.len() as f32).sqrt();

    let mut fft_input = vec![Complex::new(0.0_f32, 0.0_f32); FFT_SIZE];
    let copy_len = samples.len().min(FFT_SIZE);
    let sample_start = samples.len().saturating_sub(copy_len);

    for index in 0..copy_len {
        let window = hann_window(index, FFT_SIZE);
        fft_input[index].re = samples[sample_start + index] * window;
    }

    let mut planner = FftPlanner::<f32>::new();
    let fft = planner.plan_fft_forward(FFT_SIZE);
    fft.process(&mut fft_input);

    let magnitudes: Vec<f32> = fft_input[..FFT_SIZE / 2]
        .iter()
        .map(|value| value.norm() / FFT_SIZE as f32)
        .collect();
    let bins = frequency_bins(&magnitudes, sample_rate, rms);

    AudioFrame {
        bins,
        peak: (peak * 2.0).clamp(0.0, 1.0),
        rms: (rms * 2.6).clamp(0.0, 1.0),
        timestamp: now_millis(),
    }
}

fn hann_window(index: usize, size: usize) -> f32 {
    if size <= 1 {
        return 1.0;
    }

    0.5 - 0.5 * ((2.0 * PI * index as f32) / (size - 1) as f32).cos()
}

fn frequency_bins(magnitudes: &[f32], sample_rate: u32, rms: f32) -> Vec<f32> {
    let nyquist = sample_rate as f32 * 0.5;
    let min_freq = 32.0_f32;
    let max_freq = nyquist.min(18_000.0).max(min_freq + 1.0);
    let ratio = max_freq / min_freq;
    let mut raw_bins = vec![0.0; FRAME_BINS];

    for (bin_index, bin) in raw_bins.iter_mut().enumerate() {
        let start_t = bin_index as f32 / FRAME_BINS as f32;
        let end_t = (bin_index + 1) as f32 / FRAME_BINS as f32;
        let start_freq = min_freq * ratio.powf(start_t);
        let end_freq = min_freq * ratio.powf(end_t);
        let start_index = freq_to_fft_index(start_freq, sample_rate, magnitudes.len());
        let end_index =
            freq_to_fft_index(end_freq, sample_rate, magnitudes.len()).max(start_index + 1);
        let end_index = end_index.min(magnitudes.len());

        let (average, peak) = if start_index < end_index {
            let slice = &magnitudes[start_index..end_index];
            let average = slice.iter().sum::<f32>() / slice.len() as f32;
            let peak = slice
                .iter()
                .fold(0.0_f32, |current, value| current.max(*value));
            (average, peak)
        } else {
            (0.0, 0.0)
        };

        let mixed = average * 0.48 + peak * 0.52;
        *bin = ((mixed * 620.0).ln_1p() / 3.9).clamp(0.0, 1.0);
    }

    contrast_spectrum(&raw_bins, rms)
}

fn contrast_spectrum(raw_bins: &[f32], rms: f32) -> Vec<f32> {
    let mean = raw_bins.iter().sum::<f32>() / raw_bins.len().max(1) as f32;
    let peak = raw_bins
        .iter()
        .fold(0.0_f32, |current, value| current.max(*value));
    let floor = (mean * 0.68).min(peak * 0.72);
    let range = (peak - floor).max(0.001);
    let loudness = (rms * 9.0).clamp(0.18, 1.0);

    raw_bins
        .iter()
        .enumerate()
        .map(|(index, value)| {
            let position = index as f32 / (FRAME_BINS - 1) as f32;
            let center_weight = (PI * position).sin().max(0.0).powf(0.72);
            let edge_allowance = 0.12 + center_weight * 0.88;
            let dynamic = ((*value - floor) / range).clamp(0.0, 1.0);
            let shaped = dynamic.powf(1.52) * loudness;
            let retained = value.powf(1.18) * 0.22;

            (shaped * edge_allowance + retained).clamp(0.0, 1.0)
        })
        .collect()
}

fn freq_to_fft_index(freq: f32, sample_rate: u32, magnitude_len: usize) -> usize {
    let index = (freq / sample_rate as f32 * FFT_SIZE as f32).round() as usize;
    index.clamp(1, magnitude_len.saturating_sub(1))
}

fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}
