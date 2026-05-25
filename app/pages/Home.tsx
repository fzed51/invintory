import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useAuthStore } from '../stores/authStore';

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
};

type UploadImageResponse = {
  id?: string;
  error?: string;
};

type CommitImageResponse = {
  imageId?: string | null;
  error?: string;
};

const STORAGE_KEY_PREFIX = 'invintory-cellar';

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function monthYearFromIso(isoDate: string) {
  return new Date(isoDate).toLocaleDateString('fr-FR', {
    month: '2-digit',
    year: 'numeric',
  });
}

function bottleVintageLabel(bottle: Bottle) {
  return bottle.vintage || monthYearFromIso(bottle.registeredAt);
}

function normalizeBottle(raw: Partial<Bottle>): Bottle {
  return {
    id: raw.id ?? makeId('bottle'),
    wineName: raw.wineName ?? '',
    cabinetId: raw.cabinetId ?? '',
    vintage: raw.vintage ?? '',
    registeredAt: raw.registeredAt ?? nowIso(),
    illustrationImageId: typeof raw.illustrationImageId === 'string' ? raw.illustrationImageId : null,
  };
}

function normalizeCarton(raw: Partial<Carton>): Carton {
  return {
    id: raw.id ?? makeId('carton'),
    wineName: raw.wineName ?? '',
    quantity: typeof raw.quantity === 'number' ? raw.quantity : 1,
    vintage: raw.vintage ?? '',
    registeredAt: raw.registeredAt ?? nowIso(),
    illustrationImageId: typeof raw.illustrationImageId === 'string' ? raw.illustrationImageId : null,
  };
}

function readPersistedCellar(storageKey: string): PersistedCellar {
  const fallback: PersistedCellar = {
    cabinets: [],
    bottles: [],
    cartons: [],
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
    };
  } catch {
    return fallback;
  }
}

function persistCellar(storageKey: string, cellar: PersistedCellar) {
  localStorage.setItem(storageKey, JSON.stringify(cellar));
}

async function uploadTemporaryIllustration(token: string, file: File): Promise<string> {
  const formData = new FormData();
  formData.append('image', file);

  const response = await fetch('/api/images/temp', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
    body: formData,
  });

  const data = (await response.json()) as UploadImageResponse;
  if (!response.ok || typeof data.id !== 'string') {
    throw new Error(data.error ?? 'Impossible d\'envoyer l\'illustration.');
  }

  return data.id;
}

async function commitTemporaryIllustration(token: string, tempImageId: string | null): Promise<string | null> {
  const response = await fetch('/api/images/commit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify({ tempImageId }),
  });

  const data = (await response.json()) as CommitImageResponse;
  if (!response.ok) {
    throw new Error(data.error ?? 'Impossible de finaliser l\'illustration.');
  }

  return typeof data.imageId === 'string' ? data.imageId : null;
}

function revokeObjectUrl(url: string | null) {
  if (url) {
    URL.revokeObjectURL(url);
  }
}

export default function Home() {
  const user = useAuthStore((state) => state.user)!;
  const storageKey = `${STORAGE_KEY_PREFIX}-${user.id}`;
  const persisted = readPersistedCellar(storageKey);
  const [cabinets, setCabinets] = useState<Cabinet[]>(persisted.cabinets);
  const [bottles, setBottles] = useState<Bottle[]>(persisted.bottles);
  const [cartons, setCartons] = useState<Carton[]>(persisted.cartons);

  const [cabinetName, setCabinetName] = useState('');
  const [bottleWineName, setBottleWineName] = useState('');
  const [bottleVintage, setBottleVintage] = useState('');
  const [bottleCabinetId, setBottleCabinetId] = useState('');
  const [bottleIllustrationTempId, setBottleIllustrationTempId] = useState<string | null>(null);
  const [bottleIllustrationPreviewUrl, setBottleIllustrationPreviewUrl] = useState<string | null>(null);
  const [bottleImageError, setBottleImageError] = useState('');
  const [bottleImageUploading, setBottleImageUploading] = useState(false);
  const [bottleImageInputKey, setBottleImageInputKey] = useState(0);

  const [cartonWineName, setCartonWineName] = useState('');
  const [cartonVintage, setCartonVintage] = useState('');
  const [cartonQuantity, setCartonQuantity] = useState(6);
  const [cartonIllustrationTempId, setCartonIllustrationTempId] = useState<string | null>(null);
  const [cartonIllustrationPreviewUrl, setCartonIllustrationPreviewUrl] = useState<string | null>(null);
  const [cartonImageError, setCartonImageError] = useState('');
  const [cartonImageUploading, setCartonImageUploading] = useState(false);
  const [cartonImageInputKey, setCartonImageInputKey] = useState(0);

  useEffect(() => {
    return () => {
      revokeObjectUrl(bottleIllustrationPreviewUrl);
      revokeObjectUrl(cartonIllustrationPreviewUrl);
    };
  }, [bottleIllustrationPreviewUrl, cartonIllustrationPreviewUrl]);

  const availableWines = useMemo(() => {
    const map = new Map<string, { wineName: string; vintageLabel: string; quantity: number }>();

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
      const vintageLabel = carton.vintage || monthYearFromIso(carton.registeredAt);
      const key = `${carton.wineName}__${vintageLabel}`;
      const current = map.get(key);
      map.set(key, {
        wineName: carton.wineName,
        vintageLabel,
        quantity: (current?.quantity ?? 0) + carton.quantity,
      });
    }

    return Array.from(map.values()).sort((a, b) =>
      `${a.wineName} ${a.vintageLabel}`.localeCompare(`${b.wineName} ${b.vintageLabel}`, 'fr'),
    );
  }, [bottles, cartons]);

  const bottlesByCabinet = useMemo(() => {
    const map = new Map<string, number>();
    for (const bottle of bottles) {
      map.set(bottle.cabinetId, (map.get(bottle.cabinetId) ?? 0) + 1);
    }
    return map;
  }, [bottles]);

  function saveCellar(next: PersistedCellar) {
    setCabinets(next.cabinets);
    setBottles(next.bottles);
    setCartons(next.cartons);
    persistCellar(storageKey, next);
  }

  function handleCabinetSubmit(event: FormEvent) {
    event.preventDefault();
    const name = cabinetName.trim();
    if (!name) {
      return;
    }

    saveCellar({
      cabinets: [...cabinets, { id: makeId('cabinet'), name }],
      bottles,
      cartons,
    });
    setCabinetName('');
  }

  async function handleBottleIllustrationChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setBottleImageError('');

    revokeObjectUrl(bottleIllustrationPreviewUrl);
    setBottleIllustrationPreviewUrl(null);
    setBottleIllustrationTempId(null);

    if (!file) {
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setBottleIllustrationPreviewUrl(previewUrl);
    setBottleImageUploading(true);

    try {
      const imageId = await uploadTemporaryIllustration(user.token, file);
      setBottleIllustrationTempId(imageId);
    } catch {
      revokeObjectUrl(previewUrl);
      setBottleIllustrationPreviewUrl(null);
      setBottleImageError("Impossible d'envoyer l'illustration de la bouteille.");
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

    setBottleImageError('');

    let illustrationImageId: string | null;
    try {
      illustrationImageId = await commitTemporaryIllustration(user.token, bottleIllustrationTempId);
    } catch {
      setBottleImageError("Impossible de finaliser l'illustration de la bouteille.");
      return;
    }

    saveCellar({
      cabinets,
      bottles: [
        ...bottles,
        {
          id: makeId('bottle'),
          wineName,
          cabinetId: bottleCabinetId,
          vintage: bottleVintage.trim(),
          registeredAt: nowIso(),
          illustrationImageId,
        },
      ],
      cartons,
    });

    setBottleWineName('');
    setBottleVintage('');
    setBottleIllustrationTempId(null);
    setBottleImageInputKey((value) => value + 1);
    revokeObjectUrl(bottleIllustrationPreviewUrl);
    setBottleIllustrationPreviewUrl(null);
  }

  async function handleCartonIllustrationChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setCartonImageError('');

    revokeObjectUrl(cartonIllustrationPreviewUrl);
    setCartonIllustrationPreviewUrl(null);
    setCartonIllustrationTempId(null);

    if (!file) {
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setCartonIllustrationPreviewUrl(previewUrl);
    setCartonImageUploading(true);

    try {
      const imageId = await uploadTemporaryIllustration(user.token, file);
      setCartonIllustrationTempId(imageId);
    } catch {
      revokeObjectUrl(previewUrl);
      setCartonIllustrationPreviewUrl(null);
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

    setCartonImageError('');

    let illustrationImageId: string | null;
    try {
      illustrationImageId = await commitTemporaryIllustration(user.token, cartonIllustrationTempId);
    } catch {
      setCartonImageError("Impossible de finaliser l'illustration du carton.");
      return;
    }

    saveCellar({
      cabinets,
      bottles,
      cartons: [
        ...cartons,
        {
          id: makeId('carton'),
          wineName,
          quantity: cartonQuantity,
          vintage: cartonVintage.trim(),
          registeredAt: nowIso(),
          illustrationImageId,
        },
      ],
    });

    setCartonWineName('');
    setCartonVintage('');
    setCartonQuantity(6);
    setCartonIllustrationTempId(null);
    setCartonImageInputKey((value) => value + 1);
    revokeObjectUrl(cartonIllustrationPreviewUrl);
    setCartonIllustrationPreviewUrl(null);
  }

  return (
    <main className="cellar-page">
      <h1>Invintory - Gestion de cave à vin</h1>
      <p className="subtitle">
        Application web utilisable hors connexion pour gérer les armoires, les bouteilles et les
        cartons.
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
              {cabinet.name} ({bottlesByCabinet.get(cabinet.id) ?? 0} bouteille(s))
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
            {bottleImageUploading ? 'Upload image…' : 'Enregistrer'}
          </button>
          {bottleImageError && <p className="error-message">{bottleImageError}</p>}
          {bottleIllustrationPreviewUrl && (
            <img
              className="illustration-preview"
              src={bottleIllustrationPreviewUrl}
              alt="Aperçu illustration bouteille"
            />
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
            {cartonImageUploading ? 'Upload image…' : 'Enregistrer'}
          </button>
          {cartonImageError && <p className="error-message">{cartonImageError}</p>}
          {cartonIllustrationPreviewUrl && (
            <img
              className="illustration-preview"
              src={cartonIllustrationPreviewUrl}
              alt="Aperçu illustration carton"
            />
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
                {wine.wineName} — {wine.vintageLabel} : {wine.quantity} bouteille(s)
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
