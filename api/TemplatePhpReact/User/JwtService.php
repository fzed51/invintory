<?php

namespace TemplatePhpReact\User;

class JwtService
{
    private const TOKEN_TTL_SECONDS = 3600;

    private string $secret;

    public function __construct(string $secret)
    {
        if ($secret === '') {
            throw new \InvalidArgumentException('JWT secret must not be empty.');
        }

        $this->secret = $secret;
    }

    public function createToken(int $userId, string $email): string
    {
        $header = ['alg' => 'HS256', 'typ' => 'JWT'];
        $issuedAt = time();
        $payload = [
            'sub' => $userId,
            'email' => $email,
            'iat' => $issuedAt,
            'exp' => $issuedAt + self::TOKEN_TTL_SECONDS,
        ];

        $encodedHeader = $this->base64UrlEncode(json_encode($header, JSON_THROW_ON_ERROR));
        $encodedPayload = $this->base64UrlEncode(json_encode($payload, JSON_THROW_ON_ERROR));
        $signature = hash_hmac('sha256', $encodedHeader . '.' . $encodedPayload, $this->secret, true);

        return $encodedHeader . '.' . $encodedPayload . '.' . $this->base64UrlEncode($signature);
    }

    public function validateToken(string $token): ?array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return null;
        }

        [$encodedHeader, $encodedPayload, $encodedSignature] = $parts;

        $header = $this->decodeJson($encodedHeader);
        $payload = $this->decodeJson($encodedPayload);

        if (!is_array($header) || !is_array($payload)) {
            return null;
        }

        if (($header['alg'] ?? null) !== 'HS256') {
            return null;
        }

        $expectedSignature = hash_hmac('sha256', $encodedHeader . '.' . $encodedPayload, $this->secret, true);
        $actualSignature = $this->base64UrlDecode($encodedSignature);

        if ($actualSignature === false || !hash_equals($expectedSignature, $actualSignature)) {
            return null;
        }

        $expiresAt = $payload['exp'] ?? null;
        if (!is_int($expiresAt) || $expiresAt < time()) {
            return null;
        }

        return $payload;
    }

    private function decodeJson(string $value): ?array
    {
        $decoded = $this->base64UrlDecode($value);
        if ($decoded === false) {
            return null;
        }

        try {
            $data = json_decode($decoded, true, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException $exception) {
            return null;
        }

        return is_array($data) ? $data : null;
    }

    private function base64UrlEncode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }

    private function base64UrlDecode(string $value): string|false
    {
        $remainder = strlen($value) % 4;
        if ($remainder > 0) {
            $value .= str_repeat('=', 4 - $remainder);
        }

        return base64_decode(strtr($value, '-_', '+/'), true);
    }
}
