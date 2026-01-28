/**
 * VitalTrack Color System
 * Groww-inspired professional healthcare palette
 * EXACT match to Kotlin Android app colors
 */

export const colors = {
  // ============================================================================
  // BACKGROUND SYSTEM - Warm, layered depths
  // ============================================================================
  bgPrimary: '#121214',
  bgSecondary: '#1A1A1E',
  bgCard: '#1E1E22',
  bgTertiary: '#222226',
  bgHover: '#2A2A2E',
  bgPressed: '#323236',
  bgGlass: 'rgba(30, 30, 34, 0.8)',

  // ============================================================================
  // BORDER SYSTEM
  // ============================================================================
  borderPrimary: '#2A2A2E',
  borderSecondary: '#3A3A3E',
  borderFocus: '#5B9CF6',
  borderError: '#A65D5D',

  // ============================================================================
  // TEXT SYSTEM
  // ============================================================================
  textPrimary: '#F0F0F2',
  textSecondary: '#A8A8B0',
  textTertiary: '#6E6E78',
  textMuted: '#4A4A52',
  textInverse: '#121214',

  // ============================================================================
  // ACCENT SYSTEM - Primary brand color
  // ============================================================================
  accentBlue: '#5B9CF6',
  accentBlueHover: '#4A8BE6',
  accentBluePressed: '#3A7BC6',
  accentBlueBg: 'rgba(91, 156, 246, 0.12)',
  accentBlueBorder: 'rgba(91, 156, 246, 0.2)',

  // ============================================================================
  // STATUS SYSTEM - Muted, professional (NOT alarming!)
  // ============================================================================
  
  // Success/Good - Muted sage green
  statusGreen: '#7BC98C',
  statusGreenHover: '#6AB97C',
  statusGreenBg: 'rgba(123, 201, 140, 0.12)',
  statusGreenBorder: 'rgba(123, 201, 140, 0.2)',

  // Warning/Low stock - Muted bronze
  statusOrange: '#A68A5D',
  statusOrangeHover: '#B69A6D',
  statusOrangeBg: 'rgba(166, 138, 93, 0.12)',
  statusOrangeBorder: 'rgba(166, 138, 93, 0.15)',

  // Error/Out of stock - Muted dusty rose
  statusRed: '#A65D5D',
  statusRedHover: '#B66D6D',
  statusRedBg: 'rgba(166, 93, 93, 0.12)',
  statusRedBorder: 'rgba(166, 93, 93, 0.15)',

  // Pending - Neutral gray
  statusGray: '#8E8E93',
  statusGrayBg: 'rgba(142, 142, 147, 0.12)',

  // Aliases for consistency
  statusYellow: '#A68A5D',
  statusYellowBg: 'rgba(166, 138, 93, 0.12)',

  // ============================================================================
  // OVERLAYS
  // ============================================================================
  overlayDark: 'rgba(0, 0, 0, 0.75)',
  overlayLight: 'rgba(0, 0, 0, 0.3)',

  // White for icons on colored backgrounds
  white: '#FFFFFF',
  transparent: 'transparent',
};

export type ColorKeys = keyof typeof colors;
