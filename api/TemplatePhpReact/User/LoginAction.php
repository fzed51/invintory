<?php

namespace TemplatePhpReact\User;

class LoginAction
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
        $user = $this->repository->findByEmail($email);

        if ($user === null || !password_verify($password, $user['password_hash'])) {
            throw new \RuntimeException('Email ou mot de passe incorrect.');
        }

        $token = $this->jwtService->createToken((int) $user['id'], $user['email']);

        return [
            'id' => $user['id'],
            'email' => $user['email'],
            'token' => $token,
        ];
    }
}
