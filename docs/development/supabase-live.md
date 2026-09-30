# Live Supabase

Buildlog gebruikt Supabase zodra de publieke URL en publishable key in `.env` staan. Herstart de devserver na wijzigingen. Zonder deze waarden blijft de lokale demo beschikbaar; lokale demogegevens worden niet automatisch geïmporteerd.

## Wat is aangesloten?

- Registreren, e-mailbevestiging, inloggen en uitloggen.
- Projecten, verhalen, thema's, fases, werklogs, optionele BOM en kosten.
- Originele foto's in een private Storage-bucket; lezen via tijdelijke signed URLs.
- Owner-beheer van contributors en readers. Een bevestigd bestaand account krijgt direct toegang. Andere e-mailadressen krijgen een uitnodiging die na registratie en e-mailbevestiging wordt geaccepteerd (7 dagen geldig).
- Account verwijderen via de `delete-account` Edge Function: eigen projecten verwijderen of overdragen aan een bevestigd bestaand account. Opnieuw inloggen is nodig als de laatste login langer dan 15 minuten geleden is.

Uitnodigingsmails worden **niet automatisch verstuurd**. Deel de aanmeldlink zelf. Registratiebevestigingen worden wel door Supabase Auth verstuurd; configureer SMTP voor ontvangers buiten het Supabase-organisatieteam.

Geen service-role/secret key in Nuxt, GitHub Pages of `.env` voor de browser zetten. De Edge Function gebruikt uitsluitend door Supabase beheerde servercredentials. RLS bewaakt toegang ook bij directe API-aanroepen.

## Gecontroleerd op 30 september 2026

- 12 applicatietests en Nuxt typecheck geslaagd.
- 19 oorspronkelijke databasechecks en 22 gebruikersbeheerchecks geslaagd, met teruggedraaide testgegevens.
- Live API-smoketest: Auth, private projectisolatie, contributors, foto-upload/download, werklogs, BOM, publieke reads, accountoverdracht en volledig verwijderen geslaagd.
- Security advisor: geen meldingen.
- De testaccounts, projecten, onderdelen en foto's zijn opgeruimd. De database is leeg, klaar voor eigen invoer.

De ontvangst van een echte bevestigingsmail is nog niet getest. Probeer als eerste je eigen account te registreren en vervolgens dat van een tweede persoon.

De opt-in API-test staat in `scripts/live-smoke.mjs` en vereist afzonderlijke, wegwerpbare `qa-owner-*` en `qa-member-*` accounts. Gebruik nooit gewone gebruikersaccounts voor deze destructieve test.
