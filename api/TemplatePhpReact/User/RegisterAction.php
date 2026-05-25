<?php

namespace TemplatePhpReact\User;

class RegisterAction
{
    private UserRepository $repository;

    public function __construct(UserRepository $repository)
    {
        $this->repository = $repository;
    }

    public function execute(string $email, string $password): array
    {
        if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new \InvalidArgumentException('Adresse email invalide.');
        }

        if (strlen($password) < 8) {
            throw new \InvalidArgumentException('Le mot de passe doit contenir au moins 8 caractères.');
        }

        if ($this->repository->findByEmail($email) !== null) {
            throw new \RuntimeException('Un compte avec cet email existe déjà.');
        }

        $passwordHash = password_hash($password, PASSWORD_DEFAULT);
        $user = $this->repository->create($email, $passwordHash);

        $token = bin2hex(random_bytes(32));
        $this->repository->updateToken($user['id'], $token);

        return [
            'id' => $user['id'],
            'email' => $user['email'],
            'token' => $token,
        ];
    }
}
