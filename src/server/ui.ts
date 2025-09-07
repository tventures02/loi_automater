export const onInstall = (e) => {
    onOpen(e);
}

export const onOpen = (e) => {
  const menu = SpreadsheetApp.getUi()
  menu.createAddonMenu()
      .addItem('Open Bulk LOI Sender', 'openSidebar').addToUi();
};

export const showGenTemplate = () => {
    const ui = SpreadsheetApp.getUi();
    let html = HtmlService.createHtmlOutputFromFile("generateTemplate")
        .setWidth(640)
        .setHeight(300)
        .setTitle("Generate a template to start");
    ui.showModalDialog(html, "Generate a template to start")
}

export const showActivationModal = () => {
    const ui = SpreadsheetApp.getUi();
    let html = HtmlService.createHtmlOutputFromFile("activation")
        .setWidth(1500)
        .setHeight(800)
        .setTitle(" ");
    ui.showModalDialog(html, ' ');
}
export const openSidebar = () => {
  const html = HtmlService.createHtmlOutputFromFile('sidebar').setTitle("Bulk LOI Sender");
  SpreadsheetApp.getUi().showSidebar(html);
};
