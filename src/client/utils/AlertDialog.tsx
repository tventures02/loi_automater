import React from 'react';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import { Button } from '@mui/material';

const AlertDialog = ({ showAlertFlag, handleCloseAlert, contentJSX, title}) => {
    return contentJSX ? (
        <Dialog
            open={showAlertFlag}
            onClose={(event, reason) => handleCloseAlert(event, reason)}
            aria-labelledby="responsive-dialog-title"
        >
            <DialogTitle id="responsive-dialog-title">{title}</DialogTitle>
            <DialogContent>
                <DialogContentText>
                    {contentJSX}
                </DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => handleCloseAlert()} color="primary" variant='contained'>
                    Ok
                </Button>
            </DialogActions>
        </Dialog>

    ) : null;
};

export default AlertDialog;
