# Releasing

The GitHub organisation, the npm organisation and every release belong to REKSMART Insights Private Limited. They are run by the company's designated maintainer, using company email addresses.

## One-time setup

1. **GitHub organisation.** Create `merainvoices` (or the nearest free name) with a company email address. Require two-factor authentication for members (Settings → Authentication security).
2. **npm organisation.** On npmjs.com, sign up with a company email address, turn on two-factor authentication, then create the free organisation `merainvoices` so the `@merainvoices/*` names belong to the company.
3. **Repository.** Create `merainvoices/oss` (public) and push this repository. Turn on private vulnerability reporting (Settings → Security) to match `SECURITY.md`.
4. **Link packages to the repository.** npm provenance requires each `package.json` to name the repository it is built from. This is already set to `https://github.com/merainvoices/oss`. If the organisation or repository got a different name, run this from the repository root with the right URL:

   ```sh
   node -e '
   const fs = require("fs")
   const repo = "https://github.com/merainvoices/oss"
   for (const name of fs.readdirSync("packages")) {
     const file = `packages/${name}/package.json`
     const pkg = JSON.parse(fs.readFileSync(file, "utf8"))
     pkg.repository = { type: "git", url: `git+${repo}.git`, directory: `packages/${name}` }
     pkg.homepage = `${repo}/tree/main/packages/${name}#readme`
     pkg.bugs = { url: `${repo}/issues` }
     fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n")
   }'
   ```

5. **GitHub environment.** In the repository, create an environment named `npm` (Settings → Environments) and add the maintainer as a required reviewer. Every release then waits for their approval.
6. **First publish.** npm trusted publishing is set per package, and the package has to exist first. From the maintainer's computer, logged in to npm with the company account:

   ```sh
   npm test
   npm run pack:check
   cd packages/gstin && npm publish --access public && cd ../..
   # repeat for inr, upi, gstr2b
   ```

7. **Trusted publishing.** For each package on npmjs.com: Settings → Trusted publishing → GitHub Actions. Organisation `merainvoices`, repository `oss`, workflow `release.yml`, environment `npm`. Then, under Publishing access, choose to require two-factor authentication and disallow tokens.

## Every release

1. Bump `version` in each changed package's `package.json` (semver: fixes → patch, new exports → minor, breaking changes → major).
2. Run `npm test` and `npm run pack:check`.
3. Commit, then tag and push:

   ```sh
   git tag v0.1.1
   git push origin main --tags
   ```

4. Approve the `npm` environment in the Actions run. The workflow publishes every package whose version isn't on npm yet, with provenance.

## Before the first public push

- `git log` shows only company names and email addresses.
- `npm run pack:check` lists only `LICENSE`, `README.md`, `package.json` and `src/` for each package.
- Every `package.json` has `"author": "REKSMART Insights Private Limited <team@merainvoices.com>"`.
