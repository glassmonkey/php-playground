type ThemeMode = 'light' | 'dark';

export type PreviewTheme = Readonly<{
	mode: ThemeMode;
	background: string;
	foreground: string;
}>;

const themes: Readonly<Record<ThemeMode, PreviewTheme>> = {
	light: {
		mode: 'light',
		background: '#fff',
		foreground: '#000',
	},
	dark: {
		mode: 'dark',
		background: 'rgb(30, 30, 30)',
		foreground: '#d4d4d4',
	},
};

export function previewThemeFor(mode: ThemeMode): PreviewTheme {
	return themes[mode];
}
