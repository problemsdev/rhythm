/** Open a URL in the default browser, detached so it survives rhythm exiting. */
export function openInBrowser(url: string): void {
  // On Windows, rundll32 takes the URL as a plain argument, avoiding
  // cmd.exe metacharacter escaping (`start` mangles & and friends).
  const cmd =
    process.platform === "darwin" ? ["open", url]
    : process.platform === "win32" ? ["rundll32", "url.dll,FileProtocolHandler", url]
    : ["xdg-open", url]
  Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore", stdin: "ignore" }).unref()
}
