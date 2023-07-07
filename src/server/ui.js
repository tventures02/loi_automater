export const onOpen = () => {
//   const menu = SpreadsheetApp.getUi()
//     .createMenu('My Sample React Project') // edit me!
//     .addItem('Sheet Editor', 'openDialog')
//     .addItem('Sheet Editor (Bootstrap)', 'openDialogBootstrap')
//     .addItem('Sheet Editor (MUI)', 'openDialogMUI')
//     .addItem('Sheet Editor (Tailwind CSS)', 'openDialogTailwindCSS')
//     .addItem('About me', 'openAboutSidebar');

//   menu.addToUi();
  const menu = SpreadsheetApp.getUi()
  menu.createMenu('Z RE Calculator')
      .addSubMenu(menu.createMenu('Start Here')
          .addItem('Sheet Editor', 'openDialog'))
      .addItem('Open Calculator', 'openAboutSidebar')
      .addItem('Sheet Editor (MUI)', 'openDialogMUI').addToUi();
};

export const openDialog = () => {
  const html = HtmlService.createHtmlOutputFromFile('dialog-demo')
    .setWidth(600)
    .setHeight(600);
  SpreadsheetApp.getUi().showModalDialog(html, 'Sheet Editor');
};

export const openDialogBootstrap = () => {
  const html = HtmlService.createHtmlOutputFromFile('dialog-demo-bootstrap')
    .setWidth(600)
    .setHeight(600);
  SpreadsheetApp.getUi().showModalDialog(html, 'Sheet Editor (Bootstrap)');
};

export const openDialogMUI = () => {
  const html = HtmlService.createHtmlOutputFromFile('dialog-demo-mui')
    .setWidth(600)
    .setHeight(600);
  SpreadsheetApp.getUi().showModalDialog(html, 'Sheet Editor (MUI)');
};

export const openDialogTailwindCSS = () => {
  const html = HtmlService.createHtmlOutputFromFile('dialog-demo-tailwindcss')
    .setWidth(600)
    .setHeight(600);
  SpreadsheetApp.getUi().showModalDialog(html, 'Sheet Editor (Tailwind CSS)');
};

export const openAboutSidebar = () => {
  const html = HtmlService.createHtmlOutputFromFile('sidebar-about-page');
  SpreadsheetApp.getUi().showSidebar(html);
};
