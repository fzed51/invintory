import { create } from "zustand";
import { persist } from "zustand/middleware";

type AuthUser = {
	id: number;
	email: string;
	token: string;
};

type AuthState = {
	user: AuthUser | null;
	login: (user: AuthUser) => void;
	logout: () => void;
};

function decodeJwtPayload(token: string): Record<string, unknown> | null {
	const parts = token.split(".");
	if (parts.length !== 3) {
		return null;
	}

	try {
		const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
		const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
		const payload = JSON.parse(atob(padded));
		return typeof payload === "object" && payload !== null ? payload : null;
	} catch {
		return null;
	}
}

export function isJwtExpired(token: string): boolean {
	const payload = decodeJwtPayload(token);
	const exp = payload?.exp;

	if (typeof exp !== "number") {
		return true;
	}

	return exp <= Math.floor(Date.now() / 1000);
}

export const useAuthStore = create<AuthState>()(
	persist(
		(set) => ({
			user: null,
			login: (user) => set({ user: isJwtExpired(user.token) ? null : user }),
			logout: () => set({ user: null }),
		}),
		{
			name: "invintory-auth",
		},
	),
);
