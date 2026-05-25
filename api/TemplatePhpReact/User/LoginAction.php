<?php

namespace TemplatePhpReact\User;

class LoginAction
{
    private UserRepository $repository;

    public function __construct(UserRepository $repository)
    {
        $this->repository = $repository;
    }

    public function execute(string $email, string $password): array
    {
        $user = $this->repository->findByEmail($email);

        if ($user === null || !password_verify($password, $user['password_hash'])) {
            throw new \RuntimeException('Email ou mot de passe incorrect.');
        }

        $token = bin2hex(random_bytes(32));
        $this->repository->updateToken($user['id'], $token);

        return [
            'id' => $user['id'],
            'email' => $user['email'],
            'token' => $token,
        ];
    }
}
