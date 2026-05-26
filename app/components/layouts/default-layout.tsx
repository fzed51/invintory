import { type PropsWithChildren, Suspense } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";

export function DefaultLayout({ children }: PropsWithChildren) {
	const user = useAuthStore((state) => state.user);
	const logout = useAuthStore((state) => state.logout);
	const navigate = useNavigate();

	function handleLogout() {
		logout();
		navigate("/login");
	}

	return (
		<>
			<nav className="app-nav">
				<Link to="/">Accueil</Link>
				{user && (
					<div className="nav-user">
						<span className="nav-email">{user.email}</span>
						<button type="button" onClick={handleLogout} className="btn-logout">
							Déconnexion
						</button>
					</div>
				)}
			</nav>
			<Suspense fallback={<div>Chargement...</div>}>{children}</Suspense>
		</>
	);
}
