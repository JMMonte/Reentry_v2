import React from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';

export const ModalPortal = React.memo(function ModalPortal({ children }) {
    if (typeof window === 'undefined') return null;
    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return null;
    return createPortal(children, modalRoot);
});

ModalPortal.propTypes = {
    children: PropTypes.node.isRequired,
}; 