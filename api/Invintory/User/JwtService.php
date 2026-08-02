<?php

namespace Invintory\User;

use Lcobucci\Clock\SystemClock;
use Lcobucci\JWT\Configuration;
use Lcobucci\JWT\Signer\Hmac\Sha256;
use Lcobucci\JWT\Signer\Key\InMemory;
use Lcobucci\JWT\Token\UnencryptedToken;
use Lcobucci\JWT\Validation\Constraint\SignedWith;
use Lcobucci\JWT\Validation\Constraint\StrictValidAt;

class JwtService
{
    private const TOKEN_TTL_SECONDS = 3600;

    private Configuration $configuration;

    public function __construct(string $secret)
    {
        if ($secret === '') {
            throw new \InvalidArgumentException('JWT secret must not be empty.');
        }

        $this->configuration = Configuration::forSymmetricSigner(
            new Sha256(),
            InMemory::plainText($secret)
        );
    }

    public function createToken(int $userId, string $email): string
    {
        $issuedAt = new \DateTimeImmutable();
        $expiresAt = $issuedAt->modify('+' . self::TOKEN_TTL_SECONDS . ' seconds');
        $token = $this->configuration
            ->builder()
            ->relatedTo((string) $userId)
            ->withClaim('email', $email)
            ->issuedAt($issuedAt)
            ->expiresAt($expiresAt)
            ->getToken($this->configuration->signer(), $this->configuration->signingKey());

        return $token->toString();
    }

    public function validateToken(string $token): ?array
    {
        try {
            $parsedToken = $this->configuration->parser()->parse($token);
        } catch (\Throwable $exception) {
            return null;
        }

        if (!$parsedToken instanceof UnencryptedToken) {
            return null;
        }

        $clock = new SystemClock(new \DateTimeZone('UTC'));
        $constraints = [
            new SignedWith($this->configuration->signer(), $this->configuration->verificationKey()),
            new StrictValidAt($clock),
        ];

        if (!$this->configuration->validator()->validate($parsedToken, ...$constraints)) {
            return null;
        }

        $claims = $parsedToken->claims();
        $subject = $claims->get('sub');
        $email = $claims->get('email');
        $issuedAt = $claims->get('iat');
        $expiresAt = $claims->get('exp');

        if (!is_string($subject) || !ctype_digit($subject) || !is_string($email)
            || !$issuedAt instanceof \DateTimeImmutable || !$expiresAt instanceof \DateTimeImmutable) {
            return null;
        }

        return [
            'sub' => (int) $subject,
            'email' => $email,
            'iat' => $issuedAt->getTimestamp(),
            'exp' => $expiresAt->getTimestamp(),
        ];
    }
}
