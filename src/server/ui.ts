export const onInstall = (e) => {
    onOpen(e);
}

export const onOpen = (e) => {
  const menu = SpreadsheetApp.getUi()
  menu.createMenu('Z Real Estate Calculator')
      .addSubMenu(menu.createMenu('Start Here')
          .addItem('Generate Template', 'showGenTemplate'))
      .addItem('Open Calculator', 'openSidebar').addToUi();
};

export const showGenTemplate = () => {
    const ui = SpreadsheetApp.getUi();
    let html = HtmlService.createHtmlOutputFromFile("generateTemplate")
        .setWidth(640)
        .setHeight(300)
        .setTitle("Generate a template to start");
    ui.showModalDialog(html, "Generate a template to start")
}

export const openSidebar = () => {
  const html = HtmlService.createHtmlOutputFromFile('sidebar').setTitle("Z Real Estate Calculator");
  SpreadsheetApp.getUi().showSidebar(html);
};
