# Verification status

This file records the first implementation's checks and limitations. It is not a
standing product instruction or a guarantee about later revisions.

## Local environment

The initial Computer sandbox has Node 22 and a temporary PostgreSQL 18 test
instance. Docker is not available locally. The application's production
standalone build and HTTP/database integration tests can run directly here;
those checks do not certify Docker behavior.

The supported container stack pins PostgreSQL major version 17. GitHub Actions
is configured to test that actual container stack, including migrations and
application restart. Its result must be checked separately from local tests.

## Check inventory

- Learning: normalization, accepted alternatives, weighting, independent
  directional review intervals and CSV.
- Security: salted passwords, verification, credential normalization, payload
  validation, authenticated ownership and untrusted-origin rejection.
- Persistence: real account creation/sign-in, empty first workspace, saves,
  logout/re-login, revision conflicts and database isolation between users.
- UI: responsive brand at desktop, narrow sidebar and mobile menu; account
  forms; saved lists/profile; complete practice/history; import/export; retry and
  unsaved-state behavior; short desktop window and width-resize cycle.
- Hosted preview: new logo variants and existing list/practice behavior after
  deployment to the same artifact.

## Checks completed in the initial sandbox

- Seven unit-test groups passed; the optimized Next.js build passed.
- Real HTTP/PostgreSQL integration passed for authentication, cookie flags,
  account isolation, logout/re-login persistence, stale revisions, CSRF rejection,
  malformed and oversized requests, sign-out revocation and rate limiting.
- Browser flow passed for registration, creating and reloading a word list,
  completing a quiz, reloading session history, sign-out/re-login, changing the
  profile base language, and an explicitly retried simulated save failure.
- Logo bounds were checked at 1440, 1200, 1024, 900, 768, 681, 680, 390 and
  320 pixels. Account layouts were checked at desktop, tablet, mobile and a short
  desktop window, with no page-level horizontal overflow.
- Taste source lint reported zero failures and warnings. Its rendered app
  inspector reported zero failures and one ragged-row warning: the left column
  is two stacked library sections, not a card intended to end beside practice.
  Desktop, tablet and mobile screenshots were reviewed.
- Impeccable found a low-contrast placeholder, which was darkened. Its font
  warning is retained intentionally to preserve the user's approved design.
  Detector results are not a comprehensive accessibility certification.

## Container execution

The initial [GitHub Actions run](https://github.com/hkarn/vocabulary-training/actions/runs/41125942344)
passed both the unit/build job and the Docker Compose integration job.
That job built the production image, started PostgreSQL 17, applied migrations,
passed the HTTP integration suite and verified the same authenticated session
and saved list after restarting the application.

This verifies the CI container environment, not the user's device, a production
host, or backup restoration. Inspect the latest Actions run for later revisions.

## Explicit limits

Physical iOS/Android devices, Safari, mail delivery, password recovery, public
production deployment, backup/restore and external identity providers are not
verified here. The attached preview is sample-data only.
