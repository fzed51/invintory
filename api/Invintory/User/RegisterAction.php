<?php

namespace Invintory\User;

class RegisterAction
{
    private UserRepository $repository;
    private JwtService $jwtService;

    public function __construct(UserRepository $repository, JwtService $jwtService)
    {
        $this->repository = $repository;
        $this->jwtService = $jwtService;
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

        $token = $this->jwtService->createToken((int) $user['id'], $user['email']);

        return [
            'id' => $user['id'],
            'email' => $user['email'],
            'token' => $token,
        ];
    }
}
