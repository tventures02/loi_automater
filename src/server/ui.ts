export const onInstall = (e) => {
    onOpen(e);
}

export const onOpen = (e) => {
  const menu = SpreadsheetApp.getUi()
  menu.createAddonMenu()
      .addItem('Open Bulk LOI Sender', 'openSidebar').addToUi();
};

export const openSidebar = () => {
  const html = HtmlService.createHtmlOutputFromFile('sidebar').setTitle("Bulk LOI Sender");
  SpreadsheetApp.getUi().showSidebar(html);
};
