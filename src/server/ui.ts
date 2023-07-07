export const onInstall = (e) => {
    onOpen(e);
}

export const onOpen = (e) => {
  const menu = SpreadsheetApp.getUi()
  menu.createMenu('Z Real Estate Calculator')
      .addSubMenu(menu.createMenu('Start Here')
          .addItem('Generate Template', 'showGenTemplate'))
      .addItem('Open Calculator', 'openSidebar')
      .addItem('Sheet Editor (MUI)', 'openDialogMUI').addToUi();
};

export const showGenTemplate = () => {
    const ui = SpreadsheetApp.getUi();
    let html = HtmlService.createHtmlOutputFromFile("generateTemplate")
        .setWidth(640)
        .setHeight(300)
        .setTitle("Generate Vocab Lists");
    ui.showModalDialog(html, "Generate Vocab Lists")
}

export const openSidebar = () => {
  const html = HtmlService.createHtmlOutputFromFile('sidebar');
  SpreadsheetApp.getUi().showSidebar(html);
};
