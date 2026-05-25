# Dossier stores

Ce dossier contient tous les stores et hooks associés pour la gestion d'état globale de l'application frontend.

## Librairie utilisée

- [zustand](https://github.com/pmndrs/zustand) : gestion d'état simple et scalable pour React.

## Convention

- Un store par domaine ou ressource principale.
- Les hooks personnalisés sont placés ici pour accéder aux stores.

## Exemple de store

```ts
// app/stores/userStore.ts
import { create } from 'zustand';

type User = {
	id: number;
	name: string;
};

interface UserState {
	users: User[];
	addUser: (user: User) => void;
}

export const useUserStore = create<UserState>((set) => ({
	users: [],
	addUser: (user) => set((state) => ({ users: [...state.users, user] })),
}));
```

## Utilisation dans un composant

```tsx
import { useUserStore } from './stores/userStore';

function UserList() {
	const users = useUserStore((state) => state.users);
	return <ul>{users.map(u => <li key={u.id}>{u.name}</li>)}</ul>;
}
```