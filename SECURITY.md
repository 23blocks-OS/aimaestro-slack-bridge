# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Security Considerations

### Token Security

This application handles sensitive Slack API tokens. Please ensure:

- **Never commit tokens** - Use `.env` files (gitignored) or environment variables
- **Rotate compromised tokens** - If tokens are exposed, regenerate them immediately in Slack admin
- **Limit token scopes** - Only request necessary OAuth scopes
- **Use secure storage** - In production, use secrets managers (AWS Secrets Manager, HashiCorp Vault, etc.)

### Network Security

- **Localhost by default** - The bridge communicates with AI Maestro on localhost
- **No external exposure** - The Slack connection uses Socket Mode (outbound only), no webhook endpoints needed
- **TLS for production** - If exposing AI Maestro externally, always use HTTPS

### Access Control

- **Slack workspace isolation** - Messages are scoped to your Slack workspace
- **Agent routing validation** - Only agents registered in AI Maestro can be messaged
- **No credential forwarding** - Slack tokens are never sent to AI Maestro agents

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability, please:

1. **Do NOT open a public issue**
2. **Email**: security@23blocks.com (or contact maintainers privately)
3. **Include**:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

### Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 1 week
- **Fix timeline**: Depends on severity (critical: 24-72 hours, high: 1-2 weeks)

### Disclosure Policy

- We follow responsible disclosure practices
- Security fixes are released before public disclosure
- Credit given to reporters (unless anonymity requested)

## Best Practices for Deployment

### Production Checklist

- [ ] Tokens stored in environment variables or secrets manager
- [ ] `.env` file has restricted permissions (`chmod 600`)
- [ ] PM2 or systemd configured with non-root user
- [ ] Logs don't contain sensitive data
- [ ] Regular token rotation schedule established
- [ ] Monitoring for unusual activity

### Minimal Slack Permissions

The app only needs these scopes:
- `app_mentions:read` - Receive @mentions
- `channels:history` - Read channel messages (for context)
- `chat:write` - Send responses
- `im:history`, `im:read`, `im:write` - Handle DMs
- `users:read` - Get user display names

Avoid requesting additional scopes unless necessary.

## Security Updates

Security updates are announced via:
- GitHub Security Advisories
- Release notes

Subscribe to releases to stay informed.
