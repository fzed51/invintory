import type { ReactNode } from 'react';
import { useAuthStore } from '../stores/authStore';
import Login from '../pages/Login';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const user = useAuthStore((state) => state.user);

  if (!user) {
    return <Login />;
  }

  return <>{children}</>;
}
