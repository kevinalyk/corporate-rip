// brandinbox.ai does not run ads. These stay as functions so the pages that call them
// (and the AdBanner / AdSidebar components, which render nothing when false) keep working.
export async function shouldShowAd(): Promise<boolean> {
  return false
}

export async function shouldShowSidebarAd(): Promise<boolean> {
  return false
}
