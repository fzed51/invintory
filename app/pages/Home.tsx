import type { ChangeEvent, FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuthStore } from "../stores/authStore";

type Cabinet = {
	id: string;
	name: string;
};

type Bottle = {
	id: string;
	wineName: string;
	cabinetId: string;
	vintage: string;
	registeredAt: string;
	illustrationImageId: string | null;
};

type Carton = {
	id: string;
	wineName: string;
	quantity: number;
	vintage: string;
	registeredAt: string;
	illustrationImageId: string | null;
};

type PersistedCellar = {
	cabinets: Cabinet[];
	bottles: Bottle[];
	cartons: Carton[];
	updatedAt: string | null;
};

type UploadImageResponse = {
	id?: string;
	error?: string;
};

type SaveCellarResponse = {
	updatedAt?: string;
	error?: string;
};

type GetCellarResponse = {
	cellar?: Partial<PersistedCellar>;
	updatedAt?: string | null;
	error?: string;
};

const STORAGE_KEY_PREFIX = "invintory-cellar";

function nowIso() {
	return new Date().toISOString();
}

function makeId(prefix: string) {
	return `${prefix}-${crypto.randomUUID()}`;
}

function monthYearFromIso(isoDate: string) {
	return new Date(isoDate).toLocaleDateString("fr-FR", {
		month: "2-digit",
		year: "numeric",
	});
}

function bottleVintageLabel(bottle: Bottle) {
	return bottle.vintage || monthYearFromIso(bottle.registeredAt);
}

function normalizeBottle(raw: Partial<Bottle>): Bottle {
	return {
		id: raw.id ?? makeId("bottle"),
		wineName: raw.wineName ?? "",
		cabinetId: raw.cabinetId ?? "",
		vintage: raw.vintage ?? "",
		registeredAt: raw.registeredAt ?? nowIso(),
		illustrationImageId:
			typeof raw.illustrationImageId === "string"
				? raw.illustrationImageId
				: null,
	};
}

function normalizeCarton(raw: Partial<Carton>): Carton {
	return {
		id: raw.id ?? makeId("carton"),
		wineName: raw.wineName ?? "",
		quantity: typeof raw.quantity === "number" ? raw.quantity : 1,
		vintage: raw.vintage ?? "",
		registeredAt: raw.registeredAt ?? nowIso(),
		illustrationImageId:
			typeof raw.illustrationImageId === "string"
				? raw.illustrationImageId
				: null,
	};
}

function readPersistedCellar(storageKey: string): PersistedCellar {
	const fallback: PersistedCellar = {
		cabinets: [],
		bottles: [],
		cartons: [],
		updatedAt: null,
	};

	const raw = localStorage.getItem(storageKey);
	if (!raw) {
		return fallback;
	}

	try {
		const parsed = JSON.parse(raw) as Partial<PersistedCellar>;
		return {
			cabinets: parsed.cabinets ?? [],
			bottles: (parsed.bottles ?? []).map(normalizeBottle),
			cartons: (parsed.cartons ?? []).map(normalizeCarton),
			updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
		};
	} catch {
		return fallback;
	}
}

function persistCellar(storageKey: string, cellar: PersistedCellar) {
	localStorage.setItem(storageKey, JSON.stringify(cellar));
}

async function uploadTemporaryIllustration(
	token: string,
	file: File,
): Promise<string> {
	const formData = new FormData();
	formData.append("image", file);

	const response = await fetch("/api/images/temp", {
		method: "POST",
		headers: { Authorization: `Bearer ${token}` },
		body: formData,
	});

	const data = (await response.json()) as UploadImageResponse;
	if (!response.ok || typeof data.id !== "string") {
		throw new Error(data.error ?? "Impossible d'envoyer l'illustration.");
	}

	return data.id;
}

function isOnline() {
	return typeof navigator === "undefined" ? true : navigator.onLine;
}

async function saveCellarToApi(
	token: string,
	cellar: PersistedCellar,
): Promise<string | null> {
	const response = await fetch("/api/cellar", {
		method: "PUT",
		headers: {
			"Content-Type": "application/json",
			Authorization: ["Bearer", token].join(" "),
		},
		body: JSON.stringify({
			cellar: {
				cabinets: cellar.cabinets,
				bottles: cellar.bottles,
				cartons: cellar.cartons,
			},
			updatedAt: cellar.updatedAt,
		}),
	});

	if (!response.ok) {
		throw new Error("Impossible de sauvegarder la cave sur l'API.");
	}

	const data = (await response.json()) as SaveCellarResponse;
	return typeof data.updatedAt === "string" ? data.updatedAt : null;
}

async function getCellarFromApi(token: string): Promise<PersistedCellar> {
	const response = await fetch("/api/cellar", {
		headers: { Authorization: ["Bearer", token].join(" ") },
	});

	if (!response.ok) {
		throw new Error("Impossible de récupérer la cave depuis l'API.");
	}

	const data = (await response.json()) as GetCellarResponse;
	const cellar = data.cellar ?? {};

	return {
		cabinets: Array.isArray(cellar.cabinets)
			? (cellar.cabinets as Cabinet[])
			: [],
		bottles: Array.isArray(cellar.bottles)
			? (cellar.bottles as Partial<Bottle>[]).map(normalizeBottle)
			: [],
		cartons: Array.isArray(cellar.cartons)
			? (cellar.cartons as Partial<Carton>[]).map(normalizeCarton)
			: [],
		updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null,
	};
}

export default function Home() {
	const user = useAuthStore((state) => state.user);
	const token = user?.token ?? "";
	const storageKey = user ? `${STORAGE_KEY_PREFIX}-${user.id}` : "";
	const persisted = readPersistedCellar(storageKey);
	const [cabinets, setCabinets] = useState<Cabinet[]>(persisted.cabinets);
	const [bottles, setBottles] = useState<Bottle[]>(persisted.bottles);
	const [cartons, setCartons] = useState<Carton[]>(persisted.cartons);
	const [updatedAt, setUpdatedAt] = useState<string | null>(
		persisted.updatedAt,
	);

	const [cabinetName, setCabinetName] = useState("");
	const [bottleWineName, setBottleWineName] = useState("");
	const [bottleVintage, setBottleVintage] = useState("");
	const [bottleCabinetId, setBottleCabinetId] = useState("");
	const [bottleIllustrationTempId, setBottleIllustrationTempId] = useState<
		string | null
	>(null);
	const [bottleImageError, setBottleImageError] = useState("");
	const [bottleImageUploading, setBottleImageUploading] = useState(false);
	const [bottleImageInputKey, setBottleImageInputKey] = useState(0);

	const [cartonWineName, setCartonWineName] = useState("");
	const [cartonVintage, setCartonVintage] = useState("");
	const [cartonQuantity, setCartonQuantity] = useState(6);
	const [cartonIllustrationTempId, setCartonIllustrationTempId] = useState<
		string | null
	>(null);
	const [cartonImageError, setCartonImageError] = useState("");
	const [cartonImageUploading, setCartonImageUploading] = useState(false);
	const [cartonImageInputKey, setCartonImageInputKey] = useState(0);

	const availableWines = useMemo(() => {
		const map = new Map<
			string,
			{ wineName: string; vintageLabel: string; quantity: number }
		>();

		for (const bottle of bottles) {
			const key = `${bottle.wineName}__${bottleVintageLabel(bottle)}`;
			const current = map.get(key);
			map.set(key, {
				wineName: bottle.wineName,
				vintageLabel: bottleVintageLabel(bottle),
				quantity: (current?.quantity ?? 0) + 1,
			});
		}

		for (const carton of cartons) {
			const vintageLabel =
				carton.vintage || monthYearFromIso(carton.registeredAt);
			const key = `${carton.wineName}__${vintageLabel}`;
			const current = map.get(key);
			map.set(key, {
				wineName: carton.wineName,
				vintageLabel,
				quantity: (current?.quantity ?? 0) + carton.quantity,
			});
		}

		return Array.from(map.values()).sort((a, b) =>
			`${a.wineName} ${a.vintageLabel}`.localeCompare(
				`${b.wineName} ${b.vintageLabel}`,
				"fr",
			),
		);
	}, [bottles, cartons]);

	const bottlesByCabinet = useMemo(() => {
		const map = new Map<string, number>();
		for (const bottle of bottles) {
			map.set(bottle.cabinetId, (map.get(bottle.cabinetId) ?? 0) + 1);
		}
		return map;
	}, [bottles]);

	const cellarRef = useRef<PersistedCellar>(persisted);

	useEffect(() => {
		cellarRef.current = { cabinets, bottles, cartons, updatedAt };
	}, [cabinets, bottles, cartons, updatedAt]);

	const syncCellar = useCallback(async () => {
		if (!token || !storageKey || !isOnline()) {
			return;
		}

		try {
			const remoteCellar = await getCellarFromApi(token);
			const localCellar = cellarRef.current;
			const remoteUpdatedAt = remoteCellar.updatedAt ?? "";
			const localUpdatedAt = localCellar.updatedAt ?? "";

			if (remoteUpdatedAt && remoteUpdatedAt > localUpdatedAt) {
				setCabinets(remoteCellar.cabinets);
				setBottles(remoteCellar.bottles);
				setCartons(remoteCellar.cartons);
				setUpdatedAt(remoteCellar.updatedAt);
				persistCellar(storageKey, remoteCellar);
				cellarRef.current = remoteCellar;
				return;
			}

			const savedAt = await saveCellarToApi(token, localCellar);
			if (savedAt) {
				const syncedCellar = { ...localCellar, updatedAt: savedAt };
				setUpdatedAt(savedAt);
				persistCellar(storageKey, syncedCellar);
				cellarRef.current = syncedCellar;
			}
		} catch {
			// Keep local cellar if API cannot be reached.
		}
	}, [storageKey, token]);

	useEffect(() => {
		void syncCellar();

		function handleOnline() {
			void syncCellar();
		}

		window.addEventListener("online", handleOnline);

		return () => {
			window.removeEventListener("online", handleOnline);
		};
	}, [syncCellar]);

	function saveCellar(
		next: Omit<PersistedCellar, "updatedAt">,
		nextUpdatedAt = nowIso(),
	) {
		const nextCellar: PersistedCellar = { ...next, updatedAt: nextUpdatedAt };
		setCabinets(next.cabinets);
		setBottles(next.bottles);
		setCartons(next.cartons);
		setUpdatedAt(nextUpdatedAt);
		persistCellar(storageKey, nextCellar);
		cellarRef.current = nextCellar;

		if (token && storageKey && isOnline()) {
			void saveCellarToApi(token, nextCellar)
				.then((savedAt) => {
					if (!savedAt) {
						return;
					}

					const syncedCellar = { ...nextCellar, updatedAt: savedAt };
					setUpdatedAt(savedAt);
					persistCellar(storageKey, syncedCellar);
					cellarRef.current = syncedCellar;
				})
				.catch(() => {
					// Keep local cellar if API save fails.
				});
		}
	}

	if (!user) return null;

	function handleCabinetSubmit(event: FormEvent) {
		event.preventDefault();
		const name = cabinetName.trim();
		if (!name) {
			return;
		}

		saveCellar({
			cabinets: [...cabinets, { id: makeId("cabinet"), name }],
			bottles,
			cartons,
		});
		setCabinetName("");
	}

	async function handleBottleIllustrationChange(
		event: ChangeEvent<HTMLInputElement>,
	) {
		const file = event.target.files?.[0];
		setBottleImageError("");
		setBottleIllustrationTempId(null);

		if (!file) {
			return;
		}

		setBottleImageUploading(true);

		try {
			const imageId = await uploadTemporaryIllustration(token, file);
			setBottleIllustrationTempId(imageId);
		} catch {
			setBottleImageError(
				"Impossible d'envoyer l'illustration de la bouteille.",
			);
		} finally {
			setBottleImageUploading(false);
		}
	}

	async function handleBottleSubmit(event: FormEvent) {
		event.preventDefault();
		const wineName = bottleWineName.trim();
		if (!wineName || !bottleCabinetId || bottleImageUploading) {
			return;
		}

		setBottleImageError("");

		saveCellar({
			cabinets,
			bottles: [
				...bottles,
				{
					id: makeId("bottle"),
					wineName,
					cabinetId: bottleCabinetId,
					vintage: bottleVintage.trim(),
					registeredAt: nowIso(),
					illustrationImageId: bottleIllustrationTempId,
				},
			],
			cartons,
		});

		setBottleWineName("");
		setBottleVintage("");
		setBottleIllustrationTempId(null);
		setBottleImageInputKey((value) => value + 1);
	}

	async function handleCartonIllustrationChange(
		event: ChangeEvent<HTMLInputElement>,
	) {
		const file = event.target.files?.[0];
		setCartonImageError("");
		setCartonIllustrationTempId(null);

		if (!file) {
			return;
		}

		setCartonImageUploading(true);

		try {
			const imageId = await uploadTemporaryIllustration(token, file);
			setCartonIllustrationTempId(imageId);
		} catch {
			setCartonImageError("Impossible d'envoyer l'illustration du carton.");
		} finally {
			setCartonImageUploading(false);
		}
	}

	async function handleCartonSubmit(event: FormEvent) {
		event.preventDefault();
		const wineName = cartonWineName.trim();
		if (!wineName || cartonQuantity < 1 || cartonImageUploading) {
			return;
		}

		setCartonImageError("");

		saveCellar({
			cabinets,
			bottles,
			cartons: [
				...cartons,
				{
					id: makeId("carton"),
					wineName,
					quantity: cartonQuantity,
					vintage: cartonVintage.trim(),
					registeredAt: nowIso(),
					illustrationImageId: cartonIllustrationTempId,
				},
			],
		});

		setCartonWineName("");
		setCartonVintage("");
		setCartonQuantity(6);
		setCartonIllustrationTempId(null);
		setCartonImageInputKey((value) => value + 1);
	}

	return (
		<main className="cellar-page">
			<h1>Invintory - Gestion de cave à vin</h1>
			<p className="subtitle">
				Application web utilisable hors connexion pour gérer les armoires, les
				bouteilles et les cartons.
			</p>

			<section className="card">
				<h2>Armoires à vin</h2>
				<form onSubmit={handleCabinetSubmit} className="form-row">
					<input
						type="text"
						value={cabinetName}
						onChange={(event) => setCabinetName(event.target.value)}
						placeholder="Nom de l'armoire"
						aria-label="Nom de l'armoire"
					/>
					<button type="submit">Ajouter</button>
				</form>
				<ul>
					{cabinets.map((cabinet) => (
						<li key={cabinet.id}>
							{cabinet.name} ({bottlesByCabinet.get(cabinet.id) ?? 0}{" "}
							bouteille(s))
						</li>
					))}
				</ul>
			</section>

			<section className="card">
				<h2>Enregistrer une bouteille (dans une armoire)</h2>
				<form onSubmit={handleBottleSubmit} className="form-grid">
					<input
						type="text"
						value={bottleWineName}
						onChange={(event) => setBottleWineName(event.target.value)}
						placeholder="Nom du vin"
						aria-label="Nom du vin bouteille"
					/>
					<input
						type="text"
						value={bottleVintage}
						onChange={(event) => setBottleVintage(event.target.value)}
						placeholder="Millésime (optionnel)"
						aria-label="Millésime bouteille"
					/>
					<select
						value={bottleCabinetId}
						onChange={(event) => setBottleCabinetId(event.target.value)}
						aria-label="Armoire de stockage"
					>
						<option value="">Sélectionner une armoire</option>
						{cabinets.map((cabinet) => (
							<option key={cabinet.id} value={cabinet.id}>
								{cabinet.name}
							</option>
						))}
					</select>
					<input
						key={bottleImageInputKey}
						type="file"
						accept="image/*"
						capture="environment"
						onChange={handleBottleIllustrationChange}
						aria-label="Illustration bouteille"
					/>
					<button type="submit" disabled={bottleImageUploading}>
						{bottleImageUploading ? "Upload image…" : "Enregistrer"}
					</button>
					{bottleImageError && (
						<p className="error-message">{bottleImageError}</p>
					)}
				</form>
			</section>

			<section className="card">
				<h2>Enregistrer un carton (hors armoire)</h2>
				<form onSubmit={handleCartonSubmit} className="form-grid">
					<input
						type="text"
						value={cartonWineName}
						onChange={(event) => setCartonWineName(event.target.value)}
						placeholder="Nom du vin"
						aria-label="Nom du vin carton"
					/>
					<input
						type="text"
						value={cartonVintage}
						onChange={(event) => setCartonVintage(event.target.value)}
						placeholder="Millésime (optionnel)"
						aria-label="Millésime carton"
					/>
					<input
						type="number"
						min={1}
						value={cartonQuantity}
						onChange={(event) => setCartonQuantity(Number(event.target.value))}
						aria-label="Nombre de bouteilles dans le carton"
					/>
					<input
						key={cartonImageInputKey}
						type="file"
						accept="image/*"
						capture="environment"
						onChange={handleCartonIllustrationChange}
						aria-label="Illustration carton"
					/>
					<button type="submit" disabled={cartonImageUploading}>
						{cartonImageUploading ? "Upload image…" : "Enregistrer"}
					</button>
					{cartonImageError && (
						<p className="error-message">{cartonImageError}</p>
					)}
				</form>
			</section>

			<section className="card">
				<h2>Vins disponibles</h2>
				{availableWines.length === 0 ? (
					<p>Aucun vin enregistré.</p>
				) : (
					<ul>
						{availableWines.map((wine) => (
							<li key={`${wine.wineName}-${wine.vintageLabel}`}>
								{wine.wineName} — {wine.vintageLabel} : {wine.quantity}{" "}
								bouteille(s)
							</li>
						))}
					</ul>
				)}
			</section>
		</main>
	);
}
