import type { ReactNode } from "react";
import { useEffect } from "react";
import Login from "../pages/Login";
import { isJwtExpired, useAuthStore } from "../stores/authStore";

export function ProtectedRoute({ children }: { children: ReactNode }) {
	const user = useAuthStore((state) => state.user);
	const logout = useAuthStore((state) => state.logout);
	const isAuthenticated = user !== null && !isJwtExpired(user.token);

	useEffect(() => {
		if (user !== null && isJwtExpired(user.token)) {
			logout();
		}
	}, [logout, user]);

	if (!isAuthenticated) {
		return <Login />;
	}

	return <>{children}</>;
}
