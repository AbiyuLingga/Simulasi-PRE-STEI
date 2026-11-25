import { floatingJumperSocketId, holeIdToElectricalNode } from '../simulation/breadboard/breadboardModel';
import type {
  BreadboardPart,
  CableConnection,
  CableKind,
  KitControlState,
  KitId,
  PowerSupplyConfig,
  SignalGenConfig,
  SocketId,
} from '../simulation/circuit/types';
import type { DM3058Function, DM3058InputZ } from '../instruments/dm3058/types';
import type { BreadboardPresetId, CameraTarget } from '../state/labStore';
import {
  MOD1_EXTRA_TUTORIALS,
  MOD2_EXTRA_TUTORIALS,
  MOD3_EXTRA_TUTORIALS,
  MOD4_EXTRA_TUTORIALS,
  MOD5_EXTRA_TUTORIALS,
} from './extendedSubExperiments';

export type TutorialId =
  | 'mod1a_resistor_ohm'
  | 'mod1b_divider_vdc'
  | 'mod1c_loading_effect'
  | 'mod1d_dci_ohm_law'
  | 'mod1e_acv_rms_waveforms'
  | 'mod1f_kelvin_4wr'
  | 'mod2a_cal_gen'
  | 'mod2b_phase_yt'
  | 'mod2c_lissajous_xy'
  | 'mod2d_lissajous_freq'
  | 'mod2e_kit5_amp_gain'
  | 'mod2f_ac_dc_coupling'
  | 'mod3a_thevenin_vth'
  | 'mod3b_thevenin_rth'
  | 'mod3c_max_power'
  | 'mod3d_norton_source'
  | 'mod3e_reciprocity'
  | 'mod3f_superposition'
  | 'mod3g_opamp_inv'
  | 'mod3h_opamp_noninv'
  | 'mod4a_rc_transient'
  | 'mod4b_rl_transient'
  | 'mod4c_rc_diff'
  | 'mod4d_rc_integ'
  | 'mod4e_rlc_damping'
  | 'mod5a_bb_build_lpf'
  | 'mod5b_bb_bode_fc'
  | 'mod5c_hpf_bode'
  | 'mod5d_res_seri'
  | 'mod5e_res_paralel'
  | 'mod5f_res_sp1'
  | 'mod5g_res_sp2'
  | 'mod5h_filter_notch'
  | 'mod5i_filter_bandpass';

export interface WireTutorialStep {
  kind: 'wire';
  id: string;
  title: string;
  instruction: string;
  fromSocket: SocketId;
  fromLabel: string;
  toSocket: SocketId;
  toLabel: string;
  /** Optional negative/GND target when wiring a BNC Y-cable (BNC-Banana or BNC-Alligator). */
  gndSocket?: SocketId;
  gndLabel?: string;
  wireKind?: CableKind;
  acceptFrom?: SocketId[];
  acceptTo?: SocketId[];
  cableColor: string;
  cameraHint: CameraTarget;
}

export type TutorialInstrumentPreset =
  | 'dmm_ohm'
  | 'dmm_dcv'
  | 'dmm_dcv_10g'
  | 'dmm_dci'
  | 'dmm_acv_freq'
  | 'dmm_4wr'
  | 'scope_measure_vpp_freq'
  | 'scope_phase_cursor'
  | 'scope_xy_lissajous'
  | 'scope_xy_freq'
  | 'scope_ch1_ac_coupling'
  | 'scope_rc_cursor'
  | 'scope_rl_zoom'
  | 'scope_diff_50hz'
  | 'gen_fc_1590hz'
  | 'gen_hpf_fc_1940hz'
  | 'gen_res_146k'
  | 'gen_res_104k'
  | 'gen_notch_50hz'
  | 'gen_bp_14k7'
  | 'decade_rth_1120'
  | 'decade_rlc_crit';

export interface ObserveTutorialStep {
  kind: 'observe';
  id: string;
  title: string;
  instruction: string;
  /** Concrete button-by-button steps on Rigol DS1052E / DG1012 / DM3058. */
  controlsGuide: string[];
  /** What exact numbers/features on screen to read and record into the worksheet table. */
  whatToRead: string;
  instrumentPreset?: TutorialInstrumentPreset;
  instrumentPresetLabel?: string;
  cameraHint: CameraTarget;
  focusSockets?: SocketId[];
  metricKind:
    | 'dmm_vdc'
    | 'dmm_vac'
    | 'dmm_ohms'
    | 'dmm_ohms4w'
    | 'dmm_idc'
    | 'scope_ch1_ch2'
    | 'scope_ch1_vpp'
    | 'scope_ch2_vpp'
    | 'scope_phase'
    | 'scope_xy'
    | 'scope_transient';
  expectedLabel: string;
  expectedValue?: number;
  tolerance?: number;
}

export type TutorialStep = WireTutorialStep | ObserveTutorialStep;

export interface TutorialScopePatch {
  timeBaseMode?: 'Y-T' | 'X-Y' | 'Roll';
  timePerDiv?: number;
  ch1Enabled?: boolean;
  ch1VDiv?: number;
  ch1Offset?: number;
  ch2Enabled?: boolean;
  ch2VDiv?: number;
  ch2Offset?: number;
  trigSource?: 'CH1' | 'CH2';
  trigLevel?: number;
}

export interface WorksheetColumnSpec {
  key: string;
  label: string;
  placeholder?: string;
  readOnly?: boolean;
}

export interface TutorialWorksheetSpec {
  objective: string;
  formulaHint?: string;
  columns: WorksheetColumnSpec[];
  defaultRows: Array<Record<string, string>>;
  notesPlaceholder: string;
}

export interface TutorialFloatJumperSpec {
  id: string;
  holeA: string;
  color: string;
  floatOffset: [number, number];
}

export interface ModuleTutorial {
  id: TutorialId;
  moduleGroup: string;
  moduleCode: string;
  title: string;
  subtitle: string;
  kitId: KitId;
  setup: {
    signalGen?: Partial<SignalGenConfig>;
    powerSupply?: Partial<PowerSupplyConfig>;
    kitControls?: Partial<KitControlState>;
    dm3058Func?: DM3058Function;
    dm3058DualFunc?: DM3058Function;
    dm3058InputZ?: DM3058InputZ;
    breadboardPreset?: BreadboardPresetId;
    addRcFloatJumpers?: boolean;
    floatJumpers?: TutorialFloatJumperSpec[];
    scopePatch?: TutorialScopePatch;
  };
  steps: TutorialStep[];
  worksheet: TutorialWorksheetSpec;
}

export const MODULE_TUTORIALS: readonly ModuleTutorial[] = [
  // =========================================================================
  // MODUL 1 — MULTIMETER DIGITAL & PEMBAGI TEGANGAN
  // =========================================================================
  {
    id: 'mod1a_resistor_ohm',
    moduleGroup: 'Modul 1 · Multimeter, Pembebanan & Hukum Ohm',
    moduleCode: 'M1A',
    title: 'Ukur Resistansi 2-Wire (Ω)',
    subtitle: 'Kit #14 Multimeter + Rigol DM3058 Mode Ω',
    kitId: 'multimeter',
    setup: {
      powerSupply: { power: true, outputEnabled: false, ch1Voltage: 0, ch1CurrentLimit: 1.5, trackingDual12V: false },
      dm3058Func: '2WR',
    },
    steps: [
      {
        kind: 'wire',
        id: 'm1a_hi',
        title: 'Hubungkan DMM HI ke R1 1.5kΩ',
        instruction: 'Klik soket merah HI V/Ω pada Rigol DM3058 lalu colokkan banana ke sisi atas R1 1.5kΩ pada Kit #14.',
        fromSocket: 'dmm_pos',
        fromLabel: 'DMM HI V/Ω',
        toSocket: 'km_r1_1k5',
        toLabel: 'Kit #14 R1 (1.5kΩ)',
        wireKind: 'banana_4mm',
        cableColor: '#dc2626',
        cameraHint: 'bench',
      },
      {
        kind: 'wire',
        id: 'm1a_com',
        title: 'Hubungkan DMM COM ke Titik Tengah',
        instruction: 'Klik soket hitam COM DM3058 lalu colokkan banana hitam ke titik tengah divider (kaki bawah R1).',
        fromSocket: 'dmm_com',
        fromLabel: 'DMM COM',
        toSocket: 'km_div_mid',
        toLabel: 'Kit #14 Mid Node',
        acceptTo: ['km_div_mid', 'km_div_out'],
        wireKind: 'banana_4mm',
        cableColor: '#18181b',
        cameraHint: 'bench',
      },
      {
        kind: 'observe',
        id: 'm1a_obs',
        title: 'Atur Mode Ω & Catat Resistansi',
        instruction: 'Pastikan PSU mati (tanpa sumber tegangan pada resistor) sebelum mengukur hambatan dengan DM3058.',
        controlsGuide: [
          'Klik kamera DMM (atau tombol 3) untuk zoom ke Rigol DM3058.',
          'Tekan tombol Ω pada baris pertama keypad DM3058 hingga LCD menampilkan "2WR Auto".',
          'Baca angka resistansi 5½ digit pada layar LCD, lalu pindahkan probe ke R2 (Mid -> R2 bawah) untuk melengkapi tabel.',
        ],
        whatToRead: 'Nilai hambatan terukur pada LCD DM3058 (kΩ) dibandingkan nilai nominal 1.500 kΩ.',
        instrumentPreset: 'dmm_ohm',
        instrumentPresetLabel: 'Set DM3058 Ω',
        cameraHint: 'dmm',
        metricKind: 'dmm_ohms',
        expectedLabel: '1.500 kΩ (±100 Ω)',
        expectedValue: 1500,
        tolerance: 120,
      },
    ],
    worksheet: {
      objective: 'Mengukur nilai resistansi komponen pasif menggunakan Multimeter Digital Rigol DM3058 mode 2-Wire Ohm.',
      formulaHint: '% Error = |R_ukur - R_nominal| / R_nominal × 100%',
      columns: [
        { key: 'komp', label: 'Resistor', readOnly: true },
        { key: 'nom', label: 'Nominal (kΩ)', readOnly: true },
        { key: 'ukur', label: 'Terukur (kΩ)', placeholder: '1.500' },
        { key: 'err', label: 'Error (%)', placeholder: '0.0' },
      ],
      defaultRows: [
        { komp: 'R1 (Atas)', nom: '1.500', ukur: '', err: '' },
        { komp: 'R2 (Bawah)', nom: '1.500', ukur: '', err: '' },
        { komp: 'R1 + R2 Seri', nom: '3.000', ukur: '', err: '' },
      ],
      notesPlaceholder: 'Catat mengapa sumber tegangan harus dimatikan saat mengukur resistansi...',
    },
  },
  {
    id: 'mod1b_divider_vdc',
    moduleGroup: 'Modul 1 · Multimeter, Pembebanan & Hukum Ohm',
    moduleCode: 'M1B',
    title: 'Pembagi Tegangan DC',
    subtitle: 'Kit #14 + PSU +6V + DM3058 DCV (Banana Tumpuk)',
    kitId: 'multimeter',
    setup: {
      powerSupply: { power: true, outputEnabled: true, ch1Voltage: 6.0, ch1CurrentLimit: 1.5, trackingDual12V: false },
      dm3058Func: 'DCV',
    },
    steps: [
      {
        kind: 'wire',
        id: 'm1b_psu_pos',
        title: 'Pasang PSU +6V ke R1',
        instruction: 'Klik soket merah PSU CH1 (+) lalu colokkan banana ke input atas R1 1.5kΩ pada Kit #14.',
        fromSocket: 'psu_ch1_pos',
        fromLabel: 'PSU CH1 +',
        toSocket: 'km_r1_1k5',
        toLabel: 'KM Div R1 1.5kΩ',
        wireKind: 'banana_4mm',
        cableColor: '#dc2626',
        cameraHint: 'bench',
      },
      {
        kind: 'wire',
        id: 'm1b_psu_neg',
        title: 'Pasang Referensi PSU (-) ke R2',
        instruction: 'Klik soket hitam PSU CH1 (-) lalu hubungkan ke terminal bawah R2 1.5kΩ.',
        fromSocket: 'psu_ch1_neg',
        fromLabel: 'PSU CH1 -',
        toSocket: 'km_r2_1k5',
        toLabel: 'KM Div R2 1.5kΩ',
        wireKind: 'banana_4mm',
        cableColor: '#18181b',
        cameraHint: 'bench',
      },
      {
        kind: 'wire',
        id: 'm1b_dmm_pos',
        title: 'Ukur Vout dengan DMM HI',
        instruction: 'Tarik banana merah dari DMM HI V/Ω ke titik tengah pembagi tegangan (Mid Node).',
        fromSocket: 'dmm_pos',
        fromLabel: 'DMM HI V/Ω',
        toSocket: 'km_div_mid',
        toLabel: 'KM Div Mid Node',
        acceptTo: ['km_div_mid', 'km_div_out'],
        wireKind: 'banana_4mm',
        cableColor: '#dc2626',
        cameraHint: 'bench',
      },
      {
        kind: 'wire',
        id: 'm1b_dmm_com',
        title: 'Tumpuk DMM COM ke Node Negatif R2',
        instruction: 'Tarik banana hitam dari DMM COM lalu tumpuk langsung di belakang banana hitam R2 1.5kΩ!',
        fromSocket: 'dmm_com',
        fromLabel: 'DMM COM',
        toSocket: 'km_r2_1k5',
        toLabel: 'KM Div R2 (Tumpuk)',
        wireKind: 'banana_4mm',
        cableColor: '#18181b',
        cameraHint: 'bench',
      },
      {
        kind: 'observe',
        id: 'm1b_obs',
        title: 'Atur DCV & Verifikasi Pembagi Tegangan',
        instruction: 'Amati bacaan tegangan DC pada DM3058, lalu coba variasikan tegangan CH1 PSU (4V, 6V, 10V) untuk mengisi tabel.',
        controlsGuide: [
          'Klik kamera DMM (tombol 3) dan pastikan mode "= V" (DCV Auto) aktif.',
          'Baca tegangan Vout pada layar 5½ digit (untuk Vin = 6.0 V, Vout harus ≈ 3.000 V).',
          'Klik kamera PSU (tombol 7) dan scroll knob CH1 V ke 4.0 V dan 10.0 V, lalu catat Vout di worksheet.',
        ],
        whatToRead: 'Pembacaan DCV pada DM3058 (Vout) vs teori Vout = Vin × R2 / (R1 + R2).',
        instrumentPreset: 'dmm_dcv',
        instrumentPresetLabel: 'Set DM3058 DCV',
        cameraHint: 'dmm',
        metricKind: 'dmm_vdc',
        expectedLabel: '3.000 V DC (±0.15 V)',
        expectedValue: 3.0,
        tolerance: 0.15,
      },
    ],
    worksheet: {
      objective: 'Memverifikasi hukum pembagi tegangan DC dengan resistor seri R1 = R2 = 1.5 kΩ.',
      formulaHint: 'Vout_teori = Vin × R2 / (R1 + R2) = 0.5 × Vin',
      columns: [
        { key: 'vin', label: 'Vin PSU (V)', readOnly: true },
        { key: 'vteori', label: 'Vout Teori (V)', readOnly: true },
        { key: 'vukur', label: 'Vout DMM (V)', placeholder: '3.000' },
        { key: 'selisih', label: 'Selisih (mV)', placeholder: '0.0' },
      ],
      defaultRows: [
        { vin: '4.0', vteori: '2.000', vukur: '', selisih: '' },
        { vin: '6.0', vteori: '3.000', vukur: '', selisih: '' },
        { vin: '10.0', vteori: '5.000', vukur: '', selisih: '' },
      ],
      notesPlaceholder: 'Bandingkan Vout hasil ukur DM3058 dengan teori pembagi tegangan...',
    },
  },
  ...MOD1_EXTRA_TUTORIALS,

  // =========================================================================
  // MODUL 2 — OSILOSKOP RIGOL DS1052E & GENERATOR SINYAL DG1012
  // =========================================================================
  {
    id: 'mod2a_cal_gen',
    moduleGroup: 'Modul 2 · Osiloskop & Generator Sinyal',
    moduleCode: 'M2A',
    title: 'Kalibrasi Probe & Sinyal DG1012',
    subtitle: 'BNC-BNC (DG1012 → CH1) + BNC-Buaya (Probe Comp → CH2)',
    kitId: 'rl_rc',
    setup: {
      signalGen: { power: true, outputEnabled: true, waveform: 'sine', freqHz: 1000, vpp: 4.0, dcOffset: 0, attenuator20dB: false },
      scopePatch: {
        timeBaseMode: 'Y-T',
        timePerDiv: 500e-6,
        ch1Enabled: true,
        ch1VDiv: 1,
        ch1Offset: 1.5,
        ch2Enabled: true,
        ch2VDiv: 1,
        ch2Offset: -1.8,
        trigSource: 'CH1',
        trigLevel: 0,
      },
    },
    steps: [
      {
        kind: 'wire',
        id: 'm2a_gen_ch1',
        title: 'Kabel BNC-BNC: DG1012 CH1 ke DS1052E CH1',
        instruction: 'Klik BNC CH1 pada Rigol DG1012 lalu klik BNC CH1 pada Rigol DS1052E — otomatis menjadi kabel koaksial BNC-BNC!',
        fromSocket: 'gen_out',
        fromLabel: 'DG1012 CH1 BNC',
        toSocket: 'rigol_ch1',
        toLabel: 'DS1052E CH1 BNC',
        wireKind: 'bnc_bnc',
        cableColor: '#eab308',
        cameraHint: 'bench',
      },
      {
        kind: 'wire',
        id: 'm2a_comp_ch2',
        title: 'BNC-Buaya: CH2 ke Lug Kalibrasi 3Vpp 1kHz',
        instruction: 'Klik BNC CH2 pada DS1052E lalu klik lug atas PROBE COMP — otomatis berubah jadi BNC-Buaya (+/-)!',
        fromSocket: 'rigol_ch2',
        fromLabel: 'DS1052E CH2 BNC',
        toSocket: 'rigol_comp_sig',
        toLabel: 'PROBE COMP 3Vpp',
        gndSocket: 'rigol_comp_gnd',
        gndLabel: 'PROBE COMP GND',
        wireKind: 'bnc_alligator',
        cableColor: '#06b6d4',
        cameraHint: 'rigol',
      },
      {
        kind: 'observe',
        id: 'm2a_obs',
        title: 'Baca Vpp & Frekuensi dengan Menu Measure',
        instruction: 'Gunakan tombol Measure pada Rigol DS1052E untuk menampilkan Vpp dan Frekuensi otomatis pada layar.',
        controlsGuide: [
          'Klik kamera Rigol (tombol 2). Pastikan CH1 (kuning) dan CH2 (biru) tampil stabil (status T\'D).',
          'Tekan tombol "Measure" di blok MENU atas -> pilih Source CH1 -> aktifkan Vpp dan Freq.',
          'Atur skala vertikal (knob SCALE V/div) & horizontal (Time/div = 500µs) agar terlihat ~2–6 siklus penuh.',
          'Catat nilai Vpp dan Freq CH1 (sinus 4 Vpp 1 kHz) serta CH2 (kotak kalibrasi 3 Vpp 1 kHz) ke tabel worksheet.',
        ],
        whatToRead: 'Bar pengukuran bawah LCD: Freq (1.00 kHz), Vpp CH1 (~4.00 Vpp), dan Vpp CH2 (~3.00 Vpp).',
        instrumentPreset: 'scope_measure_vpp_freq',
        instrumentPresetLabel: 'Aktifkan Measure',
        cameraHint: 'rigol',
        metricKind: 'scope_ch1_ch2',
        expectedLabel: 'CH1: 4.00 Vpp 1.00 kHz | CH2: 3.00 Vpp',
        expectedValue: 4.0,
        tolerance: 0.4,
      },
    ],
    worksheet: {
      objective: 'Mengoperasikan generator sinyal Rigol DG1012 dan memverifikasi kalibrasi kanal Rigol DS1052E.',
      formulaHint: 'f = 1 / T   |   Vpp = (jumlah div puncak-ke-puncak) × (Volt/div)',
      columns: [
        { key: 'kanal', label: 'Sumber / Kanal', readOnly: true },
        { key: 'bentuk', label: 'Bentuk Gelombang', placeholder: 'Sinus / Kotak' },
        { key: 'vpp', label: 'Vpp (V)', placeholder: '4.00' },
        { key: 'freq', label: 'Freq (kHz)', placeholder: '1.00' },
      ],
      defaultRows: [
        { kanal: 'CH1 (DG1012)', bentuk: 'Sinus', vpp: '', freq: '' },
        { kanal: 'CH2 (Probe Comp)', bentuk: 'Kotak', vpp: '', freq: '' },
      ],
      notesPlaceholder: 'Catat kesesuaian amplitudo dan frekuensi layar DS1052E dengan setting DG1012...',
    },
  },
  {
    id: 'mod2b_phase_yt',
    moduleGroup: 'Modul 2 · Osiloskop & Generator Sinyal',
    moduleCode: 'M2B',
    title: 'Beda Fasa Mode Y-T (Δt / T)',
    subtitle: 'Kit #5 Penggeser Fasa + DG1012 + DS1052E (BNC-Banana)',
    kitId: 'osc_gen',
    setup: {
      signalGen: { power: true, outputEnabled: true, waveform: 'sine', freqHz: 1000, vpp: 4.0, dcOffset: 0, attenuator20dB: false },
      scopePatch: {
        timeBaseMode: 'Y-T',
        timePerDiv: 200e-6,
        ch1Enabled: true,
        ch1VDiv: 1,
        ch1Offset: 1.4,
        ch2Enabled: true,
        ch2VDiv: 1,
        ch2Offset: -1.4,
        trigSource: 'CH1',
        trigLevel: 0,
      },
    },
    steps: [
      {
        kind: 'wire',
        id: 'm2b_gen_in',
        title: 'BNC-Banana DG1012 ke Penggeser Fasa Kit #5',
        instruction: 'Klik BNC CH1 DG1012 lalu klik soket kiri Phase IN Kit #5 (otomatis jadi Y 2× Banana +/-), lalu pasang hitam (-) ke Phase OUT kanan.',
        fromSocket: 'gen_out',
        fromLabel: 'DG1012 CH1 BNC',
        toSocket: 'ko_ph_l',
        toLabel: 'Kit #5 Phase IN (+)',
        gndSocket: 'ko_ph_r',
        gndLabel: 'Kit #5 Phase GND (-)',
        wireKind: 'bnc_banana',
        cableColor: '#dc2626',
        cameraHint: 'bench',
      },
      {
        kind: 'wire',
        id: 'm2b_gnd',
        title: 'Pastikan Referensi GND Phase Shifter Terhubung',
        instruction: 'Jika cabang hitam (-) DG1012 belum dipasang ke soket kanan Phase OUT, pasang sekarang (atau tarik dari GND).',
        fromSocket: 'gen_gnd',
        fromLabel: 'DG1012 GND (-)',
        toSocket: 'ko_ph_r',
        toLabel: 'Kit #5 Phase OUT (GND)',
        wireKind: 'banana_4mm',
        cableColor: '#18181b',
        cameraHint: 'kit',
      },
      {
        kind: 'wire',
        id: 'm2b_ch1',
        title: 'Tumpuk CH1 DS1052E pada Input Phase IN',
        instruction: 'Klik BNC CH1 DS1052E lalu tumpuk banana kuning (+) di belakang banana merah pada Kit #5 Phase IN!',
        fromSocket: 'rigol_ch1',
        fromLabel: 'DS1052E CH1 BNC',
        toSocket: 'ko_ph_l',
        toLabel: 'Kit #5 Phase IN (Tumpuk)',
        gndSocket: 'ko_ph_r',
        gndLabel: 'Kit #5 Phase GND',
        wireKind: 'bnc_banana',
        cableColor: '#eab308',
        cameraHint: 'bench',
      },
      {
        kind: 'wire',
        id: 'm2b_ch2',
        title: 'Sadap Node Tengah Phase MID pada CH2',
        instruction: 'Klik BNC CH2 DS1052E lalu sambungkan banana biru (+) ke titik tengah RC (Kit #5 Phase MID).',
        fromSocket: 'rigol_ch2',
        fromLabel: 'DS1052E CH2 BNC',
        toSocket: 'ko_ph_c',
        toLabel: 'Kit #5 Phase MID',
        gndSocket: 'ko_ph_r',
        gndLabel: 'Kit #5 Phase GND',
        wireKind: 'bnc_banana',
        cableColor: '#06b6d4',
        cameraHint: 'bench',
      },
      {
        kind: 'observe',
        id: 'm2b_obs',
        title: 'Ukur Δt Menggunakan Cursor DS1052E',
        instruction: 'Gunakan Cursor Waktu (Time) pada mode Y-T untuk mengukur beda waktu Δt antara puncak CH1 dan CH2.',
        controlsGuide: [
          'Klik kamera Rigol (tombol 2). Pastikan Time/Div = 200 µs/div agar pergeseran puncak CH1 & CH2 terlihat jelas.',
          'Tekan tombol "Cursor" di blok MENU atas -> pilih Mode "Manual" -> Type "Time".',
          'Geser kursor A ke puncak positif CH1 dan kursor B ke puncak positif CH2 terdekat, lalu baca ΔX (Δt).',
          'Hitung beda fasa φ = 360° × (Δt / T) dengan T = 1.00 ms (1000 µs). Coba putar Pot Fasa di Kit #5 dan catat!',
        ],
        whatToRead: 'Δt (beda waktu puncak CH1–CH2 dalam µs), Vpp CH1 (~3.95 V), dan Vpp CH2 (~1.74 V).',
        instrumentPreset: 'scope_phase_cursor',
        instrumentPresetLabel: 'Aktifkan Cursor Time',
        cameraHint: 'rigol',
        metricKind: 'scope_phase',
        expectedLabel: 'CH1 ~3.95 Vpp | CH2 ~1.74 Vpp (φ ≈ 64°)',
        expectedValue: 1.74,
        tolerance: 0.35,
      },
    ],
    worksheet: {
      objective: 'Mengukur pergeseran fasa rangkaian RC menggunakan metode dual-trace Y-T (Δt / T).',
      formulaHint: 'φ = (Δt / T) × 360°   |   T = 1 / f = 1000 µs pada f = 1 kHz',
      columns: [
        { key: 'pot', label: 'Pot Kit #5', readOnly: true },
        { key: 'v2', label: 'CH2 Vpp (V)', placeholder: '1.74' },
        { key: 'dt', label: 'Δt (µs)', placeholder: '178' },
        { key: 'phi', label: 'Fasa φ (°)', placeholder: '64.1' },
      ],
      defaultRows: [
        { pot: 'Minimum (~1 kΩ)', v2: '', dt: '', phi: '' },
        { pot: 'Default (3.3 kΩ)', v2: '', dt: '', phi: '' },
        { pot: 'Maksimum (~10 kΩ)', v2: '', dt: '', phi: '' },
      ],
      notesPlaceholder: 'Bagaimana pengaruh kenaikan nilai Pot terhadap sudut fasa φ dan amplitudo CH2?',
    },
  },
  {
    id: 'mod2c_lissajous_xy',
    moduleGroup: 'Modul 2 · Osiloskop & Generator Sinyal',
    moduleCode: 'M2C',
    title: 'Kurva Lissajous (Mode X-Y)',
    subtitle: 'Cara Atur Mode X-Y & Baca A, B pada DS1052E',
    kitId: 'osc_gen',
    setup: {
      signalGen: { power: true, outputEnabled: true, waveform: 'sine', freqHz: 1000, vpp: 4.0, dcOffset: 0, attenuator20dB: false },
      scopePatch: {
        timeBaseMode: 'Y-T',
        timePerDiv: 500e-6,
        ch1Enabled: true,
        ch1VDiv: 1,
        ch1Offset: 0,
        ch2Enabled: true,
        ch2VDiv: 1,
        ch2Offset: 0,
        trigSource: 'CH1',
        trigLevel: 0,
      },
    },
    steps: [
      {
        kind: 'wire',
        id: 'm2c_gen_in',
        title: 'Pasang BNC-Banana DG1012 ke Phase Shifter Kit #5',
        instruction: 'Hubungkan DG1012 CH1 BNC ke Kit #5 Phase IN (+) dan pasang cabang hitam (-) ke Phase OUT (GND).',
        fromSocket: 'gen_out',
        fromLabel: 'DG1012 CH1 BNC',
        toSocket: 'ko_ph_l',
        toLabel: 'Kit #5 Phase IN (+)',
        gndSocket: 'ko_ph_r',
        gndLabel: 'Kit #5 Phase GND (-)',
        wireKind: 'bnc_banana',
        cableColor: '#dc2626',
        cameraHint: 'bench',
      },
      {
        kind: 'wire',
        id: 'm2c_gnd',
        title: 'Pastikan Referensi GND Phase Shifter Terhubung',
        instruction: 'Pastikan cabang hitam (-) DG1012 terpasang ke soket kanan Phase OUT (GND) agar loop referensi tertutup.',
        fromSocket: 'gen_gnd',
        fromLabel: 'DG1012 GND (-)',
        toSocket: 'ko_ph_r',
        toLabel: 'Kit #5 Phase OUT (GND)',
        wireKind: 'banana_4mm',
        cableColor: '#18181b',
        cameraHint: 'kit',
      },
      {
        kind: 'wire',
        id: 'm2c_ch1',
        title: 'Sadap Sumbu X (CH1) ke Input Phase IN',
        instruction: 'Tarik BNC-Banana kuning dari DS1052E CH1 lalu tumpuk di soket Kit #5 Phase IN sebagai sinyal sumbu X.',
        fromSocket: 'rigol_ch1',
        fromLabel: 'DS1052E CH1 (Sumbu X)',
        toSocket: 'ko_ph_l',
        toLabel: 'Kit #5 Phase IN',
        gndSocket: 'ko_ph_r',
        gndLabel: 'Kit #5 Phase GND',
        wireKind: 'bnc_banana',
        cableColor: '#eab308',
        cameraHint: 'bench',
      },
      {
        kind: 'wire',
        id: 'm2c_ch2',
        title: 'Sadap Sumbu Y (CH2) ke Output Phase MID',
        instruction: 'Tarik BNC-Banana biru dari DS1052E CH2 ke Kit #5 Phase MID sebagai sinyal sumbu Y.',
        fromSocket: 'rigol_ch2',
        fromLabel: 'DS1052E CH2 (Sumbu Y)',
        toSocket: 'ko_ph_c',
        toLabel: 'Kit #5 Phase MID',
        gndSocket: 'ko_ph_r',
        gndLabel: 'Kit #5 Phase GND',
        wireKind: 'bnc_banana',
        cableColor: '#06b6d4',
        cameraHint: 'bench',
      },
      {
        kind: 'observe',
        id: 'm2c_obs',
        title: 'Munculkan Elips Lissajous & Hitung φ = arcsin(A/B)',
        instruction: 'Ikuti urutan tombol DS1052E berikut untuk mengubah tampilan Y-T menjadi kurva Lissajous X-Y yang presisi:',
        controlsGuide: [
          '1. Klik kamera Rigol (tombol 2) untuk melihat panel depan DS1052E.',
          '2. Di blok HORIZONTAL, tekan tombol "MENU" -> di sidebar kanan klik softkey ke-1 ("Time Base") -> pilih "X-Y".',
          '3. Pusatkan elips di tengah grid (tekan klik pada knob VERTICAL POSITION CH1 & CH2 agar offset = 0.00V).',
          '4. Atur CH2 V/div = 500mV agar elips terlihat besar dan mudah dibaca pada kotak 8×8 div.',
          '5. Baca tinggi perpotongan elips pada sumbu vertikal tengah (X = 0) dari bawah ke atas = A (div atau V), dan tinggi total puncak-ke-puncak elips = B (div atau V).',
          '6. Tekan "Cursor" -> "Manual" untuk mengukur A dan B secara akurat, lalu hitung φ = arcsin(A / B). Putar Pot Fasa Kit #5 untuk melihat elips membuka/menutup!',
        ],
        whatToRead: 'A = tinggi potong sumbu Y (saat X=0), B = tinggi total vertikal elips, lalu φ = arcsin(A / B).',
        instrumentPreset: 'scope_xy_lissajous',
        instrumentPresetLabel: 'Buka Mode X-Y + Cursor',
        cameraHint: 'rigol',
        metricKind: 'scope_xy',
        expectedLabel: 'Elips Lissajous X-Y (φ ≈ 64°, A/B ≈ 0.90)',
        expectedValue: 1.74,
        tolerance: 0.45,
      },
    ],
    worksheet: {
      objective: 'Menentukan beda fasa dua sinyal sinus menggunakan metode kurva Lissajous (Mode X-Y) pada Rigol DS1052E.',
      formulaHint: 'φ = arcsin(A / B)   |   A = jarak potong sumbu Y (X=0), B = tinggi total elips',
      columns: [
        { key: 'pot', label: 'Kondisi Pot Fasa', readOnly: true },
        { key: 'a', label: 'A (div / V)', placeholder: '3.12' },
        { key: 'b', label: 'B (div / V)', placeholder: '3.48' },
        { key: 'phi', label: 'φ = arcsin(A/B) (°)', placeholder: '63.7' },
      ],
      defaultRows: [
        { pot: 'Pot Rendah (~1 kΩ)', a: '', b: '', phi: '' },
        { pot: 'Pot Tengah (3.3 kΩ)', a: '', b: '', phi: '' },
        { pot: 'Pot Tinggi (~8 kΩ)', a: '', b: '', phi: '' },
      ],
      notesPlaceholder: 'Bandingkan nilai sudut fasa φ dari metode Lissajous (M2C) dengan metode Y-T (M2B)...',
    },
  },
  ...MOD2_EXTRA_TUTORIALS,

  // =========================================================================
  // MODUL 3 — TEOREMA THEVENIN & NORTON
  // =========================================================================
  {
    id: 'mod3a_thevenin_vth',
    moduleGroup: 'Modul 3 · Teorema Rangkaian & Op-Amp 741',
    moduleCode: 'M3A',
    title: 'Tegangan Open-Circuit (Vth)',
    subtitle: 'Kit #22 Rangkaian N + Rigol DM3058 Mode DCV',
    kitId: 'thevenin',
    setup: {
      dm3058Func: 'DCV',
    },
    steps: [
      {
        kind: 'wire',
        id: 'm3a_vpos',
        title: 'Catu +18V Kit ke Terminal A',
        instruction: 'Klik soket 18V + (A) pada Kit #22 lalu colokkan banana merah ke terminal A Rangkaian N.',
        fromSocket: 'kt_18_p',
        fromLabel: 'Kit #22 18V + (A)',
        toSocket: 'kt_n_a',
        toLabel: 'Rangkaian N (A)',
        wireKind: 'banana_4mm',
        cableColor: '#dc2626',
        cameraHint: 'kit',
      },
      {
        kind: 'wire',
        id: 'm3a_vneg',
        title: 'Referensi 18V (-) ke Terminal B',
        instruction: 'Sambungkan banana hitam dari 18V - (B) ke terminal B Rangkaian N.',
        fromSocket: 'kt_18_n',
        fromLabel: 'Kit #22 18V - (B)',
        toSocket: 'kt_n_b',
        toLabel: 'Rangkaian N (B)',
        wireKind: 'banana_4mm',
        cableColor: '#18181b',
        cameraHint: 'kit',
      },
      {
        kind: 'wire',
        id: 'm3a_dmm_c',
        title: 'Ukur Terminal Output C (Vth+)',
        instruction: 'Hubungkan DMM HI V/Ω ke terminal C Rangkaian N tanpa beban (open circuit).',
        fromSocket: 'dmm_pos',
        fromLabel: 'DMM HI V/Ω',
        toSocket: 'kt_n_c',
        toLabel: 'Rangkaian N (C)',
        wireKind: 'banana_4mm',
        cableColor: '#dc2626',
        cameraHint: 'bench',
      },
      {
        kind: 'wire',
        id: 'm3a_dmm_d',
        title: 'Hubungkan DMM COM ke Terminal D (Vth-)',
        instruction: 'Sambungkan DMM COM ke terminal D Rangkaian N untuk membaca tegangan open-circuit V_CD.',
        fromSocket: 'dmm_com',
        fromLabel: 'DMM COM',
        toSocket: 'kt_n_d',
        toLabel: 'Rangkaian N (D)',
        wireKind: 'banana_4mm',
        cableColor: '#18181b',
        cameraHint: 'bench',
      },
      {
        kind: 'observe',
        id: 'm3a_obs',
        title: 'Catat Tegangan Thevenin Vth',
        instruction: 'Pastikan terminal C–D tidak dihubungkan ke beban apa pun agar terukur tegangan open-circuit Vth.',
        controlsGuide: [
          'Klik kamera DMM (tombol 3) dan pastikan mode "= V" (DCV Auto) aktif.',
          'Baca nilai tegangan V_CD pada layar 5½ digit (≈ 6.803 V DC) dan masukkan ke tabel worksheet.',
        ],
        whatToRead: 'Tegangan open-circuit Vth = V_CD pada layar DM3058 (~6.80 V DC).',
        instrumentPreset: 'dmm_dcv',
        instrumentPresetLabel: 'Set DM3058 DCV',
        cameraHint: 'dmm',
        metricKind: 'dmm_vdc',
        expectedLabel: '~6.80 V DC (Vth = V_CD)',
        expectedValue: 6.8,
        tolerance: 0.35,
      },
    ],
    worksheet: {
      objective: 'Menentukan tegangan ekuivalen Thevenin (Vth) dari jaringan linier Rangkaian N pada Kit #22.',
      formulaHint: 'Vth = V_CD (kondisi tanpa beban / open circuit)',
      columns: [
        { key: 'param', label: 'Parameter', readOnly: true },
        { key: 'ukur', label: 'Nilai Terukur', placeholder: '6.803' },
        { key: 'satuan', label: 'Satuan', readOnly: true },
      ],
      defaultRows: [
        { param: 'Sumber Vs (A–B)', ukur: '18.00', satuan: 'V DC' },
        { param: 'Tegangan Vth (C–D)', ukur: '', satuan: 'V DC' },
      ],
      notesPlaceholder: 'Catat polaritas terminal C (+) terhadap D (-) hasil pengukuran...',
    },
  },
  {
    id: 'mod3b_thevenin_rth',
    moduleGroup: 'Modul 3 · Teorema Rangkaian & Op-Amp 741',
    moduleCode: 'M3B',
    title: 'Arus Hubung Singkat (Isc) & Rth',
    subtitle: 'Kit #22 Rangkaian N + DM3058 Mode DCI (Port I)',
    kitId: 'thevenin',
    setup: {
      dm3058Func: 'DCI',
    },
    steps: [
      {
        kind: 'wire',
        id: 'm3b_vpos',
        title: 'Catu +18V ke Terminal A',
        instruction: 'Hubungkan banana merah dari 18V + (A) ke terminal A Rangkaian N pada Kit #22.',
        fromSocket: 'kt_18_p',
        fromLabel: 'Kit #22 18V + (A)',
        toSocket: 'kt_n_a',
        toLabel: 'Rangkaian N (A)',
        wireKind: 'banana_4mm',
        cableColor: '#dc2626',
        cameraHint: 'kit',
      },
      {
        kind: 'wire',
        id: 'm3b_vneg',
        title: 'Referensi 18V (-) ke Terminal B',
        instruction: 'Hubungkan banana hitam dari 18V - (B) ke terminal B Rangkaian N.',
        fromSocket: 'kt_18_n',
        fromLabel: 'Kit #22 18V - (B)',
        toSocket: 'kt_n_b',
        toLabel: 'Rangkaian N (B)',
        wireKind: 'banana_4mm',
        cableColor: '#18181b',
        cameraHint: 'kit',
      },
      {
        kind: 'wire',
        id: 'm3b_dmm_i',
        title: 'Pasang Amperemeter Port I ke Terminal C',
        instruction: 'Klik soket merah bawah "I" (10A/mA Input) pada DM3058 lalu hubungkan ke terminal C Rangkaian N!',
        fromSocket: 'dmm_i',
        fromLabel: 'DMM Input I (Arus)',
        toSocket: 'kt_n_c',
        toLabel: 'Rangkaian N (C)',
        wireKind: 'banana_4mm',
        cableColor: '#f59e0b',
        cameraHint: 'bench',
      },
      {
        kind: 'wire',
        id: 'm3b_dmm_com',
        title: 'Hubungkan DMM COM ke Terminal D',
        instruction: 'Hubungkan DMM COM ke terminal D untuk mengukur arus hubung singkat Norton Isc = I_N.',
        fromSocket: 'dmm_com',
        fromLabel: 'DMM COM',
        toSocket: 'kt_n_d',
        toLabel: 'Rangkaian N (D)',
        wireKind: 'banana_4mm',
        cableColor: '#18181b',
        cameraHint: 'bench',
      },
      {
        kind: 'observe',
        id: 'm3b_obs',
        title: 'Atur Mode DCI & Hitung Rth = Vth / Isc',
        instruction: 'Aktifkan mode pengukuran arus DC (= I) pada DM3058 lalu hitung resistansi ekuivalen Thevenin Rth.',
        controlsGuide: [
          'Klik kamera DMM (tombol 3) dan tekan tombol "= I" (baris atas kolom ke-2) agar layar menampilkan "DCI Auto".',
          'Baca arus hubung singkat Isc pada layar DM3058 (dalam mA).',
          'Hitung Rth = Vth (dari sub-percobaan M3A ≈ 6.803 V) dibagi Isc (dalam Ampere), lalu catat ke tabel.',
        ],
        whatToRead: 'Arus hubung singkat Isc (mA) pada layar DM3058 dan hasil hitungan Rth = Vth / Isc (Ω).',
        instrumentPreset: 'dmm_dci',
        instrumentPresetLabel: 'Set DM3058 DCI (= I)',
        cameraHint: 'dmm',
        metricKind: 'dmm_idc',
        expectedLabel: 'Isc ≈ 6.09 mA  →  Rth ≈ 1.12 kΩ',
        expectedValue: 0.00609,
        tolerance: 0.0012,
      },
    ],
    worksheet: {
      objective: 'Mengukur arus Norton Isc untuk menentukan resistansi ekuivalen Rth = Vth / Isc.',
      formulaHint: 'Rth = Vth / Isc   |   I_N = Isc',
      columns: [
        { key: 'item', label: 'Besaran', readOnly: true },
        { key: 'val', label: 'Hasil', placeholder: '' },
        { key: 'unit', label: 'Satuan', readOnly: true },
      ],
      defaultRows: [
        { item: 'Vth (dari M3A)', val: '6.803', unit: 'V' },
        { item: 'Isc (ukur DM3058 DCI)', val: '', unit: 'mA' },
        { item: 'Rth = Vth / Isc', val: '', unit: 'kΩ' },
      ],
      notesPlaceholder: 'Verifikasi apakah nilai Rth = Vth / Isc konsisten dengan struktur resistor Rangkaian N...',
    },
  },
  ...MOD3_EXTRA_TUTORIALS,

  // =========================================================================
  // MODUL 4 — RESPONS TRANSIEN RANGKAIAN ORDE 1 (RC & RL)
  // =========================================================================
  {
    id: 'mod4a_rc_transient',
    moduleGroup: 'Modul 4 · Respons Transien Orde 1 & Orde 2',
    moduleCode: 'M4A',
    title: 'Transien Step RC (τ = R·C)',
    subtitle: 'Kit RL & RC (1kΩ + 100nF) + DG1012 Kotak + DS1052E',
    kitId: 'rl_rc',
    setup: {
      signalGen: { power: true, outputEnabled: true, waveform: 'square', freqHz: 1000, vpp: 4.0, dcOffset: 2.0, dutyPct: 50, attenuator20dB: false },
      scopePatch: {
        timeBaseMode: 'Y-T',
        timePerDiv: 100e-6,
        ch1Enabled: true,
        ch1VDiv: 1,
        ch1Offset: 0.4,
        ch2Enabled: true,
        ch2VDiv: 1,
        ch2Offset: -2.2,
        trigSource: 'CH1',
        trigLevel: 2.0,
      },
    },
    steps: [
      {
        kind: 'wire',
        id: 'm4a_gen_in',
        title: 'BNC-Banana DG1012 Kotak ke 1kΩ & GND',
        instruction: 'Klik BNC CH1 DG1012 lalu klik port kanan 1kΩ pada Kit RL & RC (otomatis jadi 2× Banana +/-), lalu pasang hitam (-) ke rel GND bawah.',
        fromSocket: 'gen_out',
        fromLabel: 'DG1012 CH1 BNC',
        toSocket: 'kr_r1_out',
        toLabel: 'RL/RC 1kΩ (+)',
        gndSocket: 'kr_gnd_c',
        gndLabel: 'RL/RC GND (-)',
        wireKind: 'bnc_banana',
        cableColor: '#dc2626',
        cameraHint: 'bench',
      },
      {
        kind: 'wire',
        id: 'm4a_gnd',
        title: 'Hubungkan Referensi GND Kit',
        instruction: 'Pastikan rel GND bawah Kit RL & RC terhubung dengan referensi GND generator sinyal.',
        fromSocket: 'gen_gnd',
        fromLabel: 'DG1012 GND (-)',
        toSocket: 'kr_gnd_c',
        toLabel: 'RL/RC GND Bus',
        acceptTo: ['kr_gnd_l', 'kr_gnd_c', 'kr_gnd_r'],
        wireKind: 'banana_4mm',
        cableColor: '#18181b',
        cameraHint: 'kit',
      },
      {
        kind: 'wire',
        id: 'm4a_cap_gnd',
        title: 'Tutup Loop Seri: 100nF ke GND',
        instruction: 'Tarik banana hitam pendek dari ujung kiri kapasitor 100nF ke rel GND bawah Kit RL & RC.',
        fromSocket: 'kr_c1_in',
        fromLabel: 'RL/RC 100nF IN',
        toSocket: 'kr_gnd_l',
        toLabel: 'RL/RC GND Left',
        acceptTo: ['kr_gnd_l', 'kr_gnd_c', 'kr_gnd_r'],
        wireKind: 'banana_4mm',
        cableColor: '#18181b',
        cameraHint: 'kit',
      },
      {
        kind: 'wire',
        id: 'm4a_ch1',
        title: 'Tumpuk CH1 DS1052E pada Input Step 1kΩ',
        instruction: 'Klik BNC CH1 DS1052E lalu tumpuk banana kuning (+) di atas banana merah port 1kΩ Kit RL & RC.',
        fromSocket: 'rigol_ch1',
        fromLabel: 'DS1052E CH1 BNC',
        toSocket: 'kr_r1_out',
        toLabel: 'RL/RC 1kΩ (Tumpuk)',
        gndSocket: 'kr_gnd_r',
        gndLabel: 'RL/RC GND',
        wireKind: 'bnc_banana',
        cableColor: '#eab308',
        cameraHint: 'bench',
      },
      {
        kind: 'wire',
        id: 'm4a_ch2',
        title: 'Pantau Tegangan Kapasitor OUT pada CH2',
        instruction: 'Klik BNC CH2 DS1052E lalu hubungkan banana biru (+) ke titik tengah OUT (tegangan kapasitor Vc).',
        fromSocket: 'rigol_ch2',
        fromLabel: 'DS1052E CH2 BNC',
        toSocket: 'kr_out',
        toLabel: 'RL/RC OUT Node',
        gndSocket: 'kr_gnd_r',
        gndLabel: 'RL/RC GND',
        acceptTo: ['kr_out', 'kr_c1_y', 'kr_c2_y', 'kr_l1_y', 'kr_r1_y', 'kr_r2_y', 'kr_r3_y'],
        wireKind: 'bnc_banana',
        cableColor: '#06b6d4',
        cameraHint: 'bench',
      },
      {
        kind: 'observe',
        id: 'm4a_obs',
        title: 'Ukur Konstanta Waktu τ = 100 µs di DS1052E',
        instruction: 'Amati kurva pengisian eksponensial Vc(t) pada CH2 dan ukur waktu saat tegangan mencapai 63.2% Vmax.',
        controlsGuide: [
          'Klik kamera Rigol (tombol 2). Pastikan Trigger Level = 2.00 V (di tengah step 0–4 V) dan Time/Div = 100 µs/div.',
          'Tekan "Cursor" -> pilih Mode "Manual" -> Type "Time".',
          'Tempatkan Kursor A tepat di sisi naik (t = 0) gelombang kotak CH1, dan Kursor B saat kurva CH2 mencapai 63.2% × 4 V ≈ 2.53 V.',
          'Baca ΔX pada layar — hasilnya harus mendekati τ_teori = 1 kΩ × 100 nF = 100 µs (1 kotak horizontal)!',
        ],
        whatToRead: 'Waktu naik τ = ΔX saat Vc mencapai 2.53 V (63.2% dari 4.0 V) ≈ 100 µs.',
        instrumentPreset: 'scope_rc_cursor',
        instrumentPresetLabel: 'Atur Trigger & Cursor τ',
        cameraHint: 'rigol',
        metricKind: 'scope_transient',
        expectedLabel: 'CH1: Kotak 0–4 V | CH2: Eksponensial τ = 100 µs',
        expectedValue: 3.8,
        tolerance: 0.7,
      },
    ],
    worksheet: {
      objective: 'Mengukur konstanta waktu transien τ = R·C pada rangkaian RC seri dengan eksitasi step.',
      formulaHint: 'Vc(t) = Vmax(1 - e^(-t/τ))   |   τ = t saat Vc = 0.632 × Vmax = R × C',
      columns: [
        { key: 'rc', label: 'Kombinasi R & C', readOnly: true },
        { key: 'teori', label: 'τ Teori (µs)', readOnly: true },
        { key: 'v63', label: '0.632 Vmax (V)', placeholder: '2.53' },
        { key: 'tukur', label: 'τ Ukur (µs)', placeholder: '100' },
      ],
      defaultRows: [
        { rc: 'R = 1 kΩ, C = 100 nF', teori: '100', v63: '', tukur: '' },
        { rc: 'R = 10 kΩ, C = 8.2 nF', teori: '82', v63: '', tukur: '' },
      ],
      notesPlaceholder: 'Jelaskan mengapa pada t = 5τ kapasitor dianggap sudah terisi penuh (>99%)...',
    },
  },
  {
    id: 'mod4b_rl_transient',
    moduleGroup: 'Modul 4 · Respons Transien Orde 1 & Orde 2',
    moduleCode: 'M4B',
    title: 'Transien Step RL (τ = L/R)',
    subtitle: 'Kit RL & RC (1kΩ + 2.5mH) + DG1012 Kotak + DS1052E',
    kitId: 'rl_rc',
    setup: {
      signalGen: { power: true, outputEnabled: true, waveform: 'square', freqHz: 20000, vpp: 4.0, dcOffset: 2.0, dutyPct: 50, attenuator20dB: false },
      scopePatch: {
        timeBaseMode: 'Y-T',
        timePerDiv: 5e-6,
        ch1Enabled: true,
        ch1VDiv: 1,
        ch1Offset: 0.5,
        ch2Enabled: true,
        ch2VDiv: 1,
        ch2Offset: -1.8,
        trigSource: 'CH1',
        trigLevel: 2.0,
      },
    },
    steps: [
      {
        kind: 'wire',
        id: 'm4b_gen_in',
        title: 'BNC-Banana DG1012 (20kHz Kotak) ke 1kΩ',
        instruction: 'Sambungkan DG1012 CH1 BNC ke port kanan 1kΩ (+) pada Kit RL & RC dan cabang hitam (-) ke rel GND.',
        fromSocket: 'gen_out',
        fromLabel: 'DG1012 CH1 BNC',
        toSocket: 'kr_r1_out',
        toLabel: 'RL/RC 1kΩ (+)',
        gndSocket: 'kr_gnd_c',
        gndLabel: 'RL/RC GND (-)',
        wireKind: 'bnc_banana',
        cableColor: '#dc2626',
        cameraHint: 'bench',
      },
      {
        kind: 'wire',
        id: 'm4b_gnd',
        title: 'Pastikan Referensi GND Kit RL & RC Terhubung',
        instruction: 'Pastikan rel GND bawah Kit RL & RC terhubung ke cabang hitam (-) / GND generator sinyal.',
        fromSocket: 'gen_gnd',
        fromLabel: 'DG1012 GND (-)',
        toSocket: 'kr_gnd_c',
        toLabel: 'RL/RC GND Bus',
        acceptTo: ['kr_gnd_l', 'kr_gnd_c', 'kr_gnd_r'],
        wireKind: 'banana_4mm',
        cableColor: '#18181b',
        cameraHint: 'kit',
      },
      {
        kind: 'wire',
        id: 'm4b_ind_gnd',
        title: 'Tutup Loop Induktor 2.5mH ke GND',
        instruction: 'Tarik banana hitam dari ujung kiri induktor 2.5mH ke rel GND bawah Kit RL & RC.',
        fromSocket: 'kr_l1_in',
        fromLabel: 'RL/RC 2.5mH IN',
        toSocket: 'kr_gnd_l',
        toLabel: 'RL/RC GND Left',
        acceptTo: ['kr_gnd_l', 'kr_gnd_c', 'kr_gnd_r'],
        wireKind: 'banana_4mm',
        cableColor: '#18181b',
        cameraHint: 'kit',
      },
      {
        kind: 'wire',
        id: 'm4b_ch1',
        title: 'Tumpuk CH1 DS1052E pada Input 1kΩ',
        instruction: 'Hubungkan DS1052E CH1 ke port 1kΩ (tumpuk di belakang banana merah) untuk memantau step input.',
        fromSocket: 'rigol_ch1',
        fromLabel: 'DS1052E CH1 BNC',
        toSocket: 'kr_r1_out',
        toLabel: 'RL/RC 1kΩ',
        gndSocket: 'kr_gnd_r',
        gndLabel: 'RL/RC GND',
        wireKind: 'bnc_banana',
        cableColor: '#eab308',
        cameraHint: 'bench',
      },
      {
        kind: 'wire',
        id: 'm4b_ch2',
        title: 'Pantau Tegangan Induktor OUT pada CH2',
        instruction: 'Hubungkan DS1052E CH2 ke titik tengah OUT untuk mengamati lonjakan eksponensial meluruh V_L(t)!',
        fromSocket: 'rigol_ch2',
        fromLabel: 'DS1052E CH2 BNC',
        toSocket: 'kr_out',
        toLabel: 'RL/RC OUT Node',
        gndSocket: 'kr_gnd_r',
        gndLabel: 'RL/RC GND',
        acceptTo: ['kr_out', 'kr_c1_y', 'kr_c2_y', 'kr_l1_y', 'kr_r1_y', 'kr_r2_y', 'kr_r3_y'],
        wireKind: 'bnc_banana',
        cableColor: '#06b6d4',
        cameraHint: 'bench',
      },
      {
        kind: 'observe',
        id: 'm4b_obs',
        title: 'Zoom Time/Div 5µs & Ukur Peluruhan τ = L/R',
        instruction: 'Berbeda dengan kapasitor, tegangan induktor V_L(t) langsung melonjak lalu meluruh ke 36.8% Vpeak dalam 1τ!',
        controlsGuide: [
          'Klik kamera Rigol (tombol 2). Putar knob HORIZONTAL SCALE ke 5.00 µs/div agar peluruhan cepat terlihat jelas.',
          'Amati lonjakan tegangan induktor di CH2 saat sisi naik step CH1.',
          'Gunakan tombol Cursor (Time) untuk mengukur waktu peluruhan dari puncak hingga 36.8% Vpeak (τ = L/R ≈ 2.5 µs).',
        ],
        whatToRead: 'Puncak tegangan induktor V_L(0+) dan waktu peluruhan τ = L / R ≈ 2.5 µs (pada R=1kΩ, L=2.5mH).',
        instrumentPreset: 'scope_rl_zoom',
        instrumentPresetLabel: 'Set 5µs/div + Cursor',
        cameraHint: 'rigol',
        metricKind: 'scope_transient',
        expectedLabel: 'Lonjakan V_L(t) meluruh dengan τ = L/R ≈ 2.5 µs',
        expectedValue: 3.6,
        tolerance: 1.5,
      },
    ],
    worksheet: {
      objective: 'Mengamati respons transien tegangan induktor V_L(t) dan mengukur konstanta waktu τ = L / R.',
      formulaHint: 'V_L(t) = V_peak · e^(-t/τ)   |   τ = L / R = 2.5 mH / 1 kΩ = 2.5 µs',
      columns: [
        { key: 'rl', label: 'R & L', readOnly: true },
        { key: 'teori', label: 'τ Teori (µs)', readOnly: true },
        { key: 'vpeak', label: 'V_L Puncak (V)', placeholder: '3.8' },
        { key: 'tukur', label: 'τ Ukur (µs)', placeholder: '2.5' },
      ],
      defaultRows: [
        { rl: 'R = 1 kΩ, L = 2.5 mH', teori: '2.5', vpeak: '', tukur: '' },
      ],
      notesPlaceholder: 'Jelaskan perbedaan bentuk grafik V_L(t) dibanding V_C(t) saat menerima input step...',
    },
  },
  ...MOD4_EXTRA_TUTORIALS,

  // =========================================================================
  // MODUL 5 — RANGKAIAN FILTER RC BREADBOARD & BODE (-3 dB)
  // =========================================================================
  {
    id: 'mod5a_bb_build_lpf',
    moduleGroup: 'Modul 5 · Respon Frekuensi, Filter & Resonansi',
    moduleCode: 'M5A',
    title: 'Wiring Breadboard & BNC-Buaya',
    subtitle: 'Breadboard R 1kΩ + C 100nF + Jumper Bebas + BNC-Buaya',
    kitId: 'rl_rc',
    setup: {
      breadboardPreset: 'rc_lpf',
      addRcFloatJumpers: true,
      signalGen: { power: true, outputEnabled: true, waveform: 'sine', freqHz: 1500, vpp: 4.0, dcOffset: 0, attenuator20dB: false },
      scopePatch: {
        timeBaseMode: 'Y-T',
        timePerDiv: 200e-6,
        ch1Enabled: true,
        ch1VDiv: 1,
        ch1Offset: 1.2,
        ch2Enabled: true,
        ch2VDiv: 1,
        ch2Offset: -1.4,
        trigSource: 'CH1',
        trigLevel: 0,
      },
    },
    steps: [
      {
        kind: 'wire',
        id: 'm5a_gen_in',
        title: 'BNC-Buaya DG1012 ke Jumper Input & GND Breadboard',
        instruction: 'Klik BNC CH1 DG1012 lalu jepit ke Jumper Bebas merah Kolom 12 (otomatis jadi 2× Buaya +/-), lalu jepit buaya hitam (-) ke Jumper GND!',
        fromSocket: 'gen_out',
        fromLabel: 'DG1012 CH1 BNC',
        toSocket: 'bb_t_12_a',
        toLabel: 'BB Col 12 Input (+)',
        gndSocket: 'bb_tn_15',
        gndLabel: 'BB GND Rail (-)',
        acceptTo: ['bb_t_12_a', 'bb_t_12_b', 'bb_t_12_c', 'bb_t_12_d', 'bb_t_12_e', 'bb_float_bb_rc_jin'],
        wireKind: 'bnc_alligator',
        cableColor: '#dc2626',
        cameraHint: 'bench',
      },
      {
        kind: 'wire',
        id: 'm5a_gnd',
        title: 'Pastikan Rel Negatif Breadboard Ter-Ground',
        instruction: 'Jika buaya hitam (-) DG1012 belum terjepit pada jumper rel negatif (-) breadboard, jepit sekarang.',
        fromSocket: 'gen_gnd',
        fromLabel: 'DG1012 GND (-)',
        toSocket: 'bb_tn_15',
        toLabel: 'BB -Top Rail GND',
        acceptTo: ['bb_tn_10', 'bb_tn_15', 'bb_float_bb_rc_jgnd'],
        wireKind: 'banana_alligator',
        cableColor: '#18181b',
        cameraHint: 'bench',
      },
      {
        kind: 'wire',
        id: 'm5a_ch1',
        title: 'BNC-Buaya CH1 DS1052E ke Input Kolom 12',
        instruction: 'Klik BNC CH1 DS1052E lalu jepit buaya kuning (+) ke Jumper Input Kolom 12 (Vin) dan hitam (-) ke Jumper GND.',
        fromSocket: 'rigol_ch1',
        fromLabel: 'DS1052E CH1 BNC',
        toSocket: 'bb_t_12_a',
        toLabel: 'BB Col 12 Vin',
        gndSocket: 'bb_tn_15',
        gndLabel: 'BB GND',
        acceptTo: ['bb_t_12_a', 'bb_t_12_b', 'bb_t_12_c', 'bb_t_12_d', 'bb_t_12_e', 'bb_float_bb_rc_jin'],
        wireKind: 'bnc_alligator',
        cableColor: '#eab308',
        cameraHint: 'bench',
      },
      {
        kind: 'wire',
        id: 'm5a_ch2',
        title: 'BNC-Buaya CH2 DS1052E ke Output Kolom 18',
        instruction: 'Klik BNC CH2 DS1052E lalu jepit buaya biru (+) ke Jumper Output Kolom 18 (Vout di atas C 100nF).',
        fromSocket: 'rigol_ch2',
        fromLabel: 'DS1052E CH2 BNC',
        toSocket: 'bb_t_18_a',
        toLabel: 'BB Col 18 Vout',
        gndSocket: 'bb_tn_15',
        gndLabel: 'BB GND',
        acceptTo: ['bb_t_18_a', 'bb_t_18_b', 'bb_t_18_c', 'bb_t_18_d', 'bb_t_18_e', 'bb_float_bb_rc_jout'],
        wireKind: 'bnc_alligator',
        cableColor: '#06b6d4',
        cameraHint: 'bench',
      },
      {
        kind: 'observe',
        id: 'm5a_obs',
        title: 'Verifikasi Rangkaian Breadboard 2D & Output Filter',
        instruction: 'Anda dapat mengklik badan putih breadboard kapan saja untuk inspeksi rangkaian 2D beserta label CH1/CH2/GEN.',
        controlsGuide: [
          'Klik badan putih breadboard untuk melihat skema 2D (pastikan label GEN, CH1, CH2, GND tersambung benar), lalu klik "← Kembali".',
          'Klik kamera Rigol (tombol 2) untuk memverifikasi CH1 ≈ 3.9 Vpp dan CH2 ≈ 2.85 Vpp pada f = 1.50 kHz.',
        ],
        whatToRead: 'Perbandingan amplitudo CH1 (Vin) vs CH2 (Vout) pada f = 1.50 kHz mendekati fc ≈ 1.59 kHz.',
        instrumentPreset: 'scope_measure_vpp_freq',
        instrumentPresetLabel: 'Tampilkan Vpp & Freq',
        cameraHint: 'rigol',
        metricKind: 'scope_phase',
        expectedLabel: 'CH1 ~3.90 Vpp | CH2 ~2.85 Vpp (≈ 0.72× Vin)',
        expectedValue: 2.85,
        tolerance: 0.45,
      },
    ],
    worksheet: {
      objective: 'Merakit filter RC Low-Pass pada Breadboard 830 menggunakan Jumper Bebas dan kabel BNC-Buaya.',
      formulaHint: 'fc = 1 / (2π · R · C) = 1 / (2π · 1kΩ · 100nF) ≈ 1.59 kHz',
      columns: [
        { key: 'node', label: 'Titik Uji Breadboard', readOnly: true },
        { key: 'vpp', label: 'Vpp Terukur (V)', placeholder: '2.85' },
        { key: 'rasio', label: 'Gain (Vout/Vin)', placeholder: '0.73' },
      ],
      defaultRows: [
        { node: 'Input Vin (Kolom 12, CH1)', vpp: '', rasio: '1.00' },
        { node: 'Output Vout (Kolom 18, CH2)', vpp: '', rasio: '' },
      ],
      notesPlaceholder: 'Catat mengapa Jumper Bebas memudahkan penjepitan kabel buaya osiloskop...',
    },
  },
  {
    id: 'mod5b_bb_bode_fc',
    moduleGroup: 'Modul 5 · Respon Frekuensi, Filter & Resonansi',
    moduleCode: 'M5B',
    title: 'Ukur Kurva Bode & Cutoff (-3 dB)',
    subtitle: 'Sapuan Frekuensi Rigol DG1012 → Catat Tabel Bode',
    kitId: 'rl_rc',
    setup: {
      breadboardPreset: 'rc_lpf',
      addRcFloatJumpers: true,
      signalGen: { power: true, outputEnabled: true, waveform: 'sine', freqHz: 1590, vpp: 4.0, dcOffset: 0, attenuator20dB: false },
      scopePatch: {
        timeBaseMode: 'Y-T',
        timePerDiv: 200e-6,
        ch1Enabled: true,
        ch1VDiv: 1,
        ch1Offset: 1.2,
        ch2Enabled: true,
        ch2VDiv: 1,
        ch2Offset: -1.4,
        trigSource: 'CH1',
        trigLevel: 0,
      },
    },
    steps: [
      {
        kind: 'wire',
        id: 'm5b_gen_in',
        title: 'Pasang DG1012 (BNC-Buaya) ke Input & GND',
        instruction: 'Sambungkan BNC CH1 DG1012 ke Jumper Input Kolom 12 (+) dan GND (-) pada breadboard.',
        fromSocket: 'gen_out',
        fromLabel: 'DG1012 CH1 BNC',
        toSocket: 'bb_t_12_a',
        toLabel: 'BB Col 12 Input',
        gndSocket: 'bb_tn_15',
        gndLabel: 'BB GND',
        acceptTo: ['bb_t_12_a', 'bb_float_bb_rc_jin'],
        wireKind: 'bnc_alligator',
        cableColor: '#dc2626',
        cameraHint: 'bench',
      },
      {
        kind: 'wire',
        id: 'm5b_gnd',
        title: 'Pastikan Rel Negatif Breadboard Ter-Ground',
        instruction: 'Pastikan buaya hitam (-) DG1012 terjepit ke Jumper GND rel negatif (-) breadboard.',
        fromSocket: 'gen_gnd',
        fromLabel: 'DG1012 GND (-)',
        toSocket: 'bb_tn_15',
        toLabel: 'BB -Top Rail GND',
        acceptTo: ['bb_tn_10', 'bb_tn_15', 'bb_float_bb_rc_jgnd'],
        wireKind: 'banana_alligator',
        cableColor: '#18181b',
        cameraHint: 'bench',
      },
      {
        kind: 'wire',
        id: 'm5b_ch1',
        title: 'Sadap Vin (Kolom 12) pada CH1',
        instruction: 'Jepit BNC-Buaya kuning DS1052E CH1 ke Jumper Input Kolom 12.',
        fromSocket: 'rigol_ch1',
        fromLabel: 'DS1052E CH1 BNC',
        toSocket: 'bb_t_12_a',
        toLabel: 'BB Col 12 Vin',
        gndSocket: 'bb_tn_15',
        gndLabel: 'BB GND',
        acceptTo: ['bb_t_12_a', 'bb_float_bb_rc_jin'],
        wireKind: 'bnc_alligator',
        cableColor: '#eab308',
        cameraHint: 'bench',
      },
      {
        kind: 'wire',
        id: 'm5b_ch2',
        title: 'Sadap Vout (Kolom 18) pada CH2',
        instruction: 'Jepit BNC-Buaya biru DS1052E CH2 ke Jumper Output Kolom 18.',
        fromSocket: 'rigol_ch2',
        fromLabel: 'DS1052E CH2 BNC',
        toSocket: 'bb_t_18_a',
        toLabel: 'BB Col 18 Vout',
        gndSocket: 'bb_tn_15',
        gndLabel: 'BB GND',
        acceptTo: ['bb_t_18_a', 'bb_float_bb_rc_jout'],
        wireKind: 'bnc_alligator',
        cableColor: '#06b6d4',
        cameraHint: 'bench',
      },
      {
        kind: 'observe',
        id: 'm5b_obs',
        title: 'Sapuan Frekuensi di DG1012 & Isi Tabel Bode',
        instruction: 'Ubah frekuensi sinyal pada Rigol DG1012 untuk memetakan respons frekuensi filter RC Low-Pass:',
        controlsGuide: [
          '1. Klik kamera Gen (tombol 6) untuk melihat Rigol DG1012.',
          '2. Klik softkey biru ke-1 ("Freq"), lalu putar knob rotary (atau ketik angka di keypad lalu klik rotary) untuk mencoba 300 Hz, 1.0 kHz, 1.59 kHz, 5.0 kHz, dan 10 kHz.',
          '3. Pada setiap frekuensi, klik kamera Rigol (tombol 2), sesuaikan Time/Div agar ~2–4 siklus terlihat, dan baca Vpp CH1 & CH2.',
          '4. Catat semua pasangan Vin & Vout ke tabel worksheet dan verifikasi titik -3 dB (Gain ≈ 0.707) tepat di fc ≈ 1.59 kHz!',
        ],
        whatToRead: 'Rasio Gain = Vout / Vin dan dB = 20·log10(Vout/Vin) pada tiap titik frekuensi.',
        instrumentPreset: 'gen_fc_1590hz',
        instrumentPresetLabel: 'Set DG1012 fc = 1.59kHz',
        cameraHint: 'rigol',
        metricKind: 'scope_phase',
        expectedLabel: 'Pada fc=1.59kHz: Vout ≈ 0.707 × Vin (~2.78 Vpp)',
        expectedValue: 2.78,
        tolerance: 0.45,
      },
    ],
    worksheet: {
      objective: 'Memetakan respons amplitudo (Kurva Bode) dan menentukan frekuensi cutoff -3 dB filter RC Low-Pass.',
      formulaHint: '|H(f)| = 1 / √(1 + (f / fc)²)   |   Gain (dB) = 20 · log10(Vout / Vin)',
      columns: [
        { key: 'freq', label: 'Freq (Hz)', readOnly: true },
        { key: 'vin', label: 'Vin (Vpp)', placeholder: '3.95' },
        { key: 'vout', label: 'Vout (Vpp)', placeholder: '2.78' },
        { key: 'gain', label: 'Vout/Vin', placeholder: '0.707' },
        { key: 'db', label: 'Gain (dB)', placeholder: '-3.0' },
      ],
      defaultRows: [
        { freq: '300 Hz', vin: '', vout: '', gain: '', db: '' },
        { freq: '1.00 kHz', vin: '', vout: '', gain: '', db: '' },
        { freq: '1.59 kHz (fc)', vin: '', vout: '', gain: '', db: '' },
        { freq: '5.00 kHz', vin: '', vout: '', gain: '', db: '' },
        { freq: '10.0 kHz', vin: '', vout: '', gain: '', db: '' },
      ],
      notesPlaceholder: 'Simpulkan kemiringan roll-off filter orde-1 (dB/dekade) dan posisi frekuensi cutoff fc...',
    },
  },
  ...MOD5_EXTRA_TUTORIALS,
];

export function getTutorialById(id: TutorialId | null): ModuleTutorial | null {
  if (!id) return null;
  return MODULE_TUTORIALS.find((t) => t.id === id) ?? null;
}

export function inferBananaCableColor(socketId: SocketId): string {
  if (socketId === 'rigol_ch1' || socketId.endsWith('_ch1')) return '#eab308';
  if (socketId === 'rigol_ch2' || socketId.endsWith('_ch2')) return '#06b6d4';
  if (
    socketId.includes('_gnd') ||
    socketId.includes('_neg') ||
    socketId === 'dmm_com' ||
    socketId === 'dmm_sense_lo' ||
    socketId.startsWith('bb_tn_') ||
    socketId.startsWith('bb_bn_')
  ) {
    return '#18181b';
  }
  if (
    socketId === 'gen_out' ||
    socketId === 'gen_ch2_out' ||
    socketId === 'psu_ch1_pos' ||
    socketId === 'psu_ch2_pos' ||
    socketId === 'dmm_pos' ||
    socketId === 'dmm_sense_hi'
  ) {
    return '#dc2626';
  }
  if (socketId === 'dmm_i') return '#f59e0b';
  if (socketId.includes('comp')) return '#22c55e';
  if (socketId.includes('_y') || socketId === 'kr_out') return '#eab308';
  if (socketId.startsWith('bb_')) return '#2563eb';
  return '#dc2626';
}

const EARTH_GND_SOCKETS = new Set<string>([
  'rigol_ch1_gnd',
  'rigol_ch2_gnd',
  'rigol_comp_gnd',
  'gen_gnd',
  'psu_gnd',
]);

const KIT_OSC_GND_GROUP = new Set<string>([
  'ko_amp_in_gnd',
  'ko_amp_out_gnd',
  'ko_osc_gnd',
  'ko_b1_g1',
  'ko_b1_g2',
  'ko_b2_g1',
  'ko_b2_g2',
  'ko_b3_g1',
  'ko_b3_g2',
  'ko_b4_g1',
  'ko_b4_g2',
]);

const KIT_RLRC_OUT_GROUP = new Set<string>([
  'kr_c1_y',
  'kr_c2_y',
  'kr_l1_y',
  'kr_out',
  'kr_r1_y',
  'kr_r2_y',
  'kr_r3_y',
]);

const KIT_RLRC_GND_GROUP = new Set<string>(['kr_gnd_l', 'kr_gnd_c', 'kr_gnd_r']);

export function resolveCanonicalSocketNode(
  socketId: SocketId,
  kitId: KitId,
  breadboardParts?: BreadboardPart[]
): string {
  if (socketId.startsWith('bb_float_')) {
    const match = breadboardParts?.find(
      (p) => p.kind === 'jumper' && p.floating && floatingJumperSocketId(p.id) === socketId
    );
    return match ? holeIdToElectricalNode(match.holeA) : socketId;
  }
  if (socketId.startsWith('bb_')) {
    return holeIdToElectricalNode(socketId);
  }
  if (EARTH_GND_SOCKETS.has(socketId)) return 'EARTH_GND';

  if (kitId === 'multimeter') {
    if (socketId === 'km_div_mid' || socketId === 'km_div_out') return 'KM_DIV_MID';
    if (socketId === 'km_v_l' || socketId === 'km_v_r') return 'KM_V_BRIDGE';
    if (socketId === 'km_bus1_l' || socketId === 'km_bus1_r') return 'KM_BUS1';
    if (socketId === 'km_bus2_l' || socketId === 'km_bus2_m' || socketId === 'km_bus2_r') return 'KM_BUS2';
  } else if (kitId === 'osc_gen') {
    if (KIT_OSC_GND_GROUP.has(socketId)) return 'KO_GND';
  } else if (kitId === 'thevenin') {
    if (socketId === 'kt_e_l' || socketId === 'kt_e') return 'KT_E';
    if (socketId === 'kt_gnd_l' || socketId === 'kt_gnd_m' || socketId === 'kt_gnd_r') return 'KT_GND';
    if (socketId === 'kt_load_com' || socketId === 'kt_l0') return 'KT_LOAD_COM';
  } else if (kitId === 'rl_rc') {
    if (KIT_RLRC_OUT_GROUP.has(socketId)) return 'KR_OUT';
    if (KIT_RLRC_GND_GROUP.has(socketId)) return 'KR_GND';
  }
  return socketId;
}

function endpointMatchesList(
  sock: SocketId | null | undefined,
  accepted: SocketId[],
  kitId: KitId,
  breadboardParts?: BreadboardPart[]
): boolean {
  if (!sock) return false;
  const canon = resolveCanonicalSocketNode(sock, kitId, breadboardParts);
  return accepted.some(
    (cand) => sock === cand || canon === resolveCanonicalSocketNode(cand, kitId, breadboardParts)
  );
}

export function isWireStepSatisfied(
  step: WireTutorialStep,
  cables: CableConnection[],
  kitId: KitId,
  breadboardParts?: BreadboardPart[]
): boolean {
  const fromList = step.acceptFrom && step.acceptFrom.length > 0 ? step.acceptFrom : [step.fromSocket];
  const toList = step.acceptTo && step.acceptTo.length > 0 ? step.acceptTo : [step.toSocket];

  return cables.some((c) => {
    if (c.endA && c.endB) {
      const direct =
        endpointMatchesList(c.endA, fromList, kitId, breadboardParts) &&
        endpointMatchesList(c.endB, toList, kitId, breadboardParts);
      const reverse =
        endpointMatchesList(c.endB, fromList, kitId, breadboardParts) &&
        endpointMatchesList(c.endA, toList, kitId, breadboardParts);
      if (direct || reverse) return true;
    }
    // Also recognize the '-' GND branch of any Y-cable (BNC-Banana / BNC-Alligator / Probe)
    if (c.gndClip) {
      const refGnd: SocketId =
        c.endA === 'gen_out' || c.endB === 'gen_out' || c.endA === 'gen_ch2_out' || c.endB === 'gen_ch2_out'
          ? 'gen_gnd'
          : c.endA === 'rigol_ch2' || c.endB === 'rigol_ch2'
            ? 'rigol_ch2_gnd'
            : 'rigol_ch1_gnd';
      const gndDirect =
        endpointMatchesList(refGnd, fromList, kitId, breadboardParts) &&
        endpointMatchesList(c.gndClip, toList, kitId, breadboardParts);
      const gndReverse =
        endpointMatchesList(c.gndClip, fromList, kitId, breadboardParts) &&
        endpointMatchesList(refGnd, toList, kitId, breadboardParts);
      if (gndDirect || gndReverse) return true;
    }
    return false;
  });
}

export function getTutorialProgress(
  tutorial: ModuleTutorial,
  cables: CableConnection[],
  kitId: KitId,
  breadboardParts?: BreadboardPart[]
): {
  completedStepIds: Set<string>;
  wireCompletedCount: number;
  wireTotalCount: number;
  firstIncompleteIdx: number;
  allWiresDone: boolean;
} {
  const completedStepIds = new Set<string>();
  let wireCompletedCount = 0;
  let wireTotalCount = 0;
  let firstIncompleteIdx = tutorial.steps.length - 1;
  let foundIncomplete = false;

  tutorial.steps.forEach((step, idx) => {
    if (step.kind === 'wire') {
      wireTotalCount++;
      if (isWireStepSatisfied(step, cables, kitId, breadboardParts)) {
        completedStepIds.add(step.id);
        wireCompletedCount++;
      } else if (!foundIncomplete) {
        firstIncompleteIdx = idx;
        foundIncomplete = true;
      }
    } else if (!foundIncomplete) {
      firstIncompleteIdx = idx;
      foundIncomplete = true;
    }
  });

  return {
    completedStepIds,
    wireCompletedCount,
    wireTotalCount,
    firstIncompleteIdx,
    allWiresDone: wireCompletedCount === wireTotalCount,
  };
}
