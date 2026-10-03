# Buildlog delen via GitHub Pages

De workflow **Publish workshop to GitHub Pages** publiceert automatisch na iedere push naar `main` en kan ook handmatig worden gestart. De frontend draait statisch; Supabase verzorgt Auth, database, foto's en de accountverwijderfunctie.

1. Ga in GitHub naar **Settings → Pages** en kies **GitHub Actions** als bron. GitHub Pages voor een private repository vereist een passend betaald GitHub-abonnement. De gepubliceerde site kan publiek toegankelijk zijn; private projecten blijven beschermd door Supabase RLS.
2. Voeg onder **Settings → Secrets and variables → Actions → Variables** twee repositoryvariabelen toe:
   - `NUXT_PUBLIC_SUPABASE_URL`
   - `NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   Neem de waarden over uit je lokale `.env`. Geen databasewachtwoord of secret/service-role key toevoegen.
3. Zet in **Supabase → Authentication → URL Configuration** de Site URL op `https://gijsprins.github.io/buildlog/`. Voeg deze URLs toe aan **Redirect URLs**:
   - `https://gijsprins.github.io/buildlog/`
   - `https://gijsprins.github.io/buildlog/reset-password`
   - `http://127.0.0.1:3000/`
   - `http://127.0.0.1:3000/reset-password`
4. Controleer de Auth e-mailinstellingen/SMTP. De standaard maildienst is niet geschikt om willekeurige externe testers uit te nodigen.
5. Push naar `main`, of open **Actions → Publish workshop to GitHub Pages → Run workflow** op `main`. De workflow test en bouwt eerst en publiceert daarna.
6. Open `https://gijsprins.github.io/buildlog/`, registreer een account, maak een private project aan en voeg je vrouw als contributor toe. Bij een nieuw account deel je zelf de aanmeldlink.

De workflow gebruikt `/buildlog/` als basispad en een SPA-fallback. Bij een directe link naar een dynamische projectroute kan GitHub eerst HTTP 404 retourneren, waarna de app de juiste pagina toont. Pas het basispad aan als de repositorynaam of het domein verandert.

Officiële documentatie: [Nuxt op GitHub Pages](https://nuxt.com/deploy/github-pages) en [GitHub Pages beschikbaarheid](https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages).

## Wachtwoord herstellen

Kies **Forgot your password?** op de loginpagina. De herstelmail verwijst naar `/reset-password`, waar je een nieuw wachtwoord kiest. Een herstelmail vanuit het Supabase-dashboard die naar de Site URL verwijst wordt ook opgevangen. Ongeldige of verlopen links bieden de mogelijkheid een nieuwe mail aan te vragen. Zonder Supabase-configuratie is wachtwoordherstel niet beschikbaar.

Controleer na publicatie met je eigen account: herstelmail aanvragen, link openen, wachtwoord wijzigen, uitloggen en met het nieuwe wachtwoord inloggen. Hiervoor moet de e-mailbezorging in Supabase werken.
