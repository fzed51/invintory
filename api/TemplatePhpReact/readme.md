# namespace /TemplatePhpReact

# organisation

dans les sous dossier de `TemplatePhpReact` on trouve des dossier de de domaine / ressource dans les quel il y a des controller dédié, des action dédié et des repository

- Un controleur est directement lié à une route

  ex : '[GET] ressource/` -> $resourceController->get()

  le controleur execute les action et/ou utilise les repository

- Une action est un moyen de centraliser des actions metier

- Un repository est directement lié au moyen de persister la ressource