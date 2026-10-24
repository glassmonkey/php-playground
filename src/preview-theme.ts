export type PreviewMode = 'light' | 'dark';

export type PreviewTheme = Readonly<{
	mode: PreviewMode;
	background: string;
	foreground: string;
}>;

const themes: Readonly<Record<PreviewMode, PreviewTheme>> = {
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

export function previewThemeFor(mode: PreviewMode): PreviewTheme {
	return themes[mode];
}
