import { extendTheme, type ThemeConfig } from '@chakra-ui/react';
import { switchTheme } from './switch';

const config: ThemeConfig = {
	initialColorMode: 'system',
	useSystemColorMode: true,
};

const theme = extendTheme({
	config,
	components: { Switch: switchTheme },
});

export default theme;
