import type { ReactNode } from "react";
import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { isJwtExpired, useAuthStore } from "../stores/authStore";

export function PublicOnlyRoute({ children }: { children: ReactNode }) {
	const user = useAuthStore((state) => state.user);
	const logout = useAuthStore((state) => state.logout);
	const isAuthenticated = user !== null && !isJwtExpired(user.token);

	useEffect(() => {
		if (user !== null && isJwtExpired(user.token)) {
			logout();
		}
	}, [logout, user]);

	if (isAuthenticated) {
		return <Navigate to="/" replace />;
	}

	return <>{children}</>;
}
