/**
 * Confronte openapi.yaml au routeur réel (api/router.php).
 *
 * `redocly lint` valide la forme de la spec mais ignore totalement le code :
 * une route ajoutée dans router.php et oubliée dans la spec passe inaperçue.
 * Ce script compare les deux et échoue en cas de dérive.
 *
 * Usage : npm run api:check
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const VERBS = ["get", "post", "put", "delete", "patch"];

/** La spec, résolue en JSON par redocly (évite d'embarquer un parseur YAML). */
function loadSpec() {
	// execSync (donc via le shell) : sur Windows, Node refuse de lancer
	// directement npx.cmd. La commande est statique, aucune entrée externe.
	const json = execSync(
		"npx --yes @redocly/cli@2 bundle openapi.yaml --ext json",
		{
			encoding: "utf8",
			maxBuffer: 32 * 1024 * 1024,
			stdio: ["ignore", "pipe", "ignore"],
		},
	);

	return JSON.parse(json);
}

function routesFromSpec(spec) {
	const routes = new Map();

	for (const [path, operations] of Object.entries(spec.paths ?? {})) {
		for (const verb of VERBS) {
			const operation = operations[verb];
			if (!operation) {
				continue;
			}

			// `security: []` sur l'opération = route explicitement publique.
			const isPublic =
				Array.isArray(operation.security) && operation.security.length === 0;
			routes.set(`${verb.toUpperCase()} ${path}`, { protected: !isPublic });
		}
	}

	return routes;
}

function routesFromRouter(source) {
	const routes = new Map();
	// Une déclaration va de `$app->verb('/path'` jusqu'au `;` qui la termine ;
	// la présence de JwtAuthMiddleware dans cet intervalle marque la protection.
	const pattern = new RegExp(
		String.raw`\$app->(${VERBS.join("|")})\(\s*'([^']+)'([\s\S]*?);`,
		"g",
	);

	for (const [, verb, path, tail] of source.matchAll(pattern)) {
		// Ignore le fourre-tout du préflight CORS, hors périmètre de la spec.
		if (path.includes("{routes:")) {
			continue;
		}

		routes.set(`${verb.toUpperCase()} ${path}`, {
			protected: tail.includes("JwtAuthMiddleware"),
		});
	}

	return routes;
}

const problems = [];
const spec = routesFromSpec(loadSpec());
const router = routesFromRouter(readFileSync("api/router.php", "utf8"));

for (const route of router.keys()) {
	if (!spec.has(route)) {
		problems.push(`route implémentée mais absente de openapi.yaml : ${route}`);
	}
}

for (const route of spec.keys()) {
	if (!router.has(route)) {
		problems.push(`route documentée mais absente de api/router.php : ${route}`);
	}
}

for (const [route, actual] of router) {
	const documented = spec.get(route);
	if (!documented || documented.protected === actual.protected) {
		continue;
	}

	problems.push(
		actual.protected
			? `route protégée par JWT dans le code mais publique dans la spec : ${route}`
			: `route publique dans le code mais protégée dans la spec : ${route}`,
	);
}

if (problems.length > 0) {
	console.error(`openapi.yaml a dérivé de api/router.php :\n`);
	for (const problem of problems) {
		console.error(`  - ${problem}`);
	}
	console.error(`\n${problems.length} écart(s). Mets à jour openapi.yaml.`);
	process.exit(1);
}

const protectedCount = [...router.values()].filter((r) => r.protected).length;
console.log(
	`openapi.yaml est aligné sur api/router.php : ${router.size} routes, ` +
		`dont ${protectedCount} protégées par JWT.`,
);
