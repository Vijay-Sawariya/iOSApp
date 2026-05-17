export const colors = {
  background: '#F6F3EE',
  surface: '#FFFCF7',
  surfaceMuted: '#F1EEE7',
  surfaceRaised: '#FFFFFF',
  ink: '#1F2933',
  inkMuted: '#64707D',
  inkSubtle: '#94A0AA',
  border: '#E3DED3',
  primary: '#22577A',
  primaryDark: '#153B52',
  primarySoft: '#E6F0F3',
  accent: '#2F855A',
  accentSoft: '#E6F4EC',
  amber: '#B7791F',
  amberSoft: '#FFF4DB',
  danger: '#C2413D',
  dangerSoft: '#FCE8E6',
  purple: '#6D5BD0',
  purpleSoft: '#EFECFF',
  white: '#FFFFFF',
};

export const radii = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
};

export const shadows = {
  card: {
    shadowColor: '#1F2933',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 18,
    elevation: 3,
  },
  floating: {
    shadowColor: '#1F2933',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 8,
  },
};

export const gradients = {
  primary: ['#22577A', '#2F855A'] as [string, string],
  quiet: ['#FFFCF7', '#F1EEE7'] as [string, string],
  ocean: ['#153B52', '#22577A'] as [string, string],
};
