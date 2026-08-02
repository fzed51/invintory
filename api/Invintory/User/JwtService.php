<?php

namespace Invintory\User;

use Lcobucci\JWT\Configuration;
use Lcobucci\JWT\Signer\Hmac\Sha256;
use Lcobucci\JWT\Signer\Key\InMemory;
use Lcobucci\JWT\UnencryptedToken;
use Lcobucci\JWT\Validation\Constraint\SignedWith;
use Lcobucci\JWT\Validation\Constraint\StrictValidAt;
use Psr\Clock\ClockInterface;

class JwtService
{
    private const TOKEN_TTL_SECONDS = 3600;

    /**
     * HS256 signing requires a key of at least 256 bits.
     */
    private const MIN_SECRET_LENGTH_BYTES = 32;

    private Configuration $configuration;
    private ClockInterface $clock;

    public function __construct(string $secret)
    {
        if ($secret === '') {
            throw new \InvalidArgumentException('JWT secret must not be empty.');
        }

        if (strlen($secret) < self::MIN_SECRET_LENGTH_BYTES) {
            throw new \InvalidArgumentException(sprintf(
                'JWT secret must be at least %d bytes long for HS256, %d given.',
                self::MIN_SECRET_LENGTH_BYTES,
                strlen($secret)
            ));
        }

        $this->configuration = Configuration::forSymmetricSigner(
            new Sha256(),
            InMemory::plainText($secret)
        );

        $this->clock = new class implements ClockInterface {
            public function now(): \DateTimeImmutable
            {
                return new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
            }
        };
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
            // StrictValidAt exige le claim "nbf" : sans lui la validation échoue.
            ->canOnlyBeUsedAfter($issuedAt)
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

        $clock = $this->clock;
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
