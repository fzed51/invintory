import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
	clearScreen: false,
	plugins: [
		react({
			babel: {
				plugins: [["babel-plugin-react-compiler"]],
			},
		}),
	],
	server: {
		host: true,
		proxy: {
			"/api": {
				target: process.env.API_TARGET ?? "http://localhost:8080",
				changeOrigin: true,
			},
		},
	},
});
