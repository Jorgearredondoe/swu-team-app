# swu-team-app

Team stock and auth app for a small Star Wars: Unlimited team. Work in progress.

See [docs/DEPLOY.md](docs/DEPLOY.md) for the production deploy checklist.

## Known limitations

- Stock edits are saved after a short pause (about 0.6 s). Pending edits are flushed when
  the tab is hidden, which covers switching tabs and backgrounding the app, but
  closing the tab or the browser within that pause may lose the last edit: browsers can cancel requests
  started during unload. Reopen the app and check the value if you closed it right after
  an edit.
- A save that does not finish within a few seconds (stalled network) is reverted and an
  error is shown; retry the edit once the connection is back.
