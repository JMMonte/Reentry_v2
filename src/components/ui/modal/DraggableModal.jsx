import React, { useState, useRef, useEffect } from 'react';
import { Button } from '../button';
import { ChevronDown, ChevronUp, X, GripHorizontal } from 'lucide-react';
import PropTypes from 'prop-types';

// Module-level z-index tracker (now truly global)
if (typeof window !== 'undefined') {
  if (!window.__GLOBAL_MODAL_Z_INDEX__) window.__GLOBAL_MODAL_Z_INDEX__ = 9999;
}
const getGlobalZIndex = () => (typeof window !== 'undefined' ? window.__GLOBAL_MODAL_Z_INDEX__ : 9999);
const bumpGlobalZIndex = () => (typeof window !== 'undefined' ? ++window.__GLOBAL_MODAL_Z_INDEX__ : 10000);

export function DraggableModal({ 
  title, 
  children, 
  defaultPosition = { x: 20, y: 80 },
  rightElement,
  leftElement,
  className = '',
  isOpen = true,
  onClose = () => {},
  defaultCollapsed = false,
  minHeight,
  maxHeight,
  minWidth = 200,
  maxWidth,
  resizable = false,
  defaultHeight = 'auto',
  defaultWidth = 600,
}) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [position, setPosition] = useState(defaultPosition);
  const [height, setHeight] = useState(defaultHeight);
  const [width, setWidth] = useState(defaultWidth);
  const [zIndex, setZIndex] = useState(getGlobalZIndex());
  const modalRef = useRef(null);
  const contentRef = useRef(null);
  const dragRef = useRef({ isDragging: false, startX: 0, startY: 0 });
  const resizeRef = useRef({ isResizing: false, startY: 0, startX: 0, startHeight: 0, startWidth: 0, direction: null });

  // Update dimensions based on content only for resizable modals
  useEffect(() => {
    if (resizable && !isCollapsed && contentRef.current && height === 'auto') {
      const contentHeight = contentRef.current.scrollHeight;
      const viewportHeight = window.innerHeight;
      const maxDefaultHeight = viewportHeight * 0.5;
      if (contentHeight < maxDefaultHeight) {
        setHeight(contentHeight);
      } else {
        setHeight(maxDefaultHeight);
      }
    }
  }, [isCollapsed, children, resizable, height]);

  const startDragging = (e) => {
    // Bring this modal to front
    setZIndex(bumpGlobalZIndex());
    dragRef.current = {
      isDragging: true,
      startX: e.clientX - position.x,
      startY: e.clientY - position.y,
    };
  };

  const startResizing = (e, direction) => {
    e.preventDefault();
    resizeRef.current = {
      isResizing: true,
      startY: e.clientY,
      startX: e.clientX,
      startHeight: modalRef.current.offsetHeight,
      startWidth: modalRef.current.offsetWidth,
      startLeft: position.x,
      direction,
    };
  };

  const onDrag = (e) => {
    if (dragRef.current.isDragging) {
      const newX = e.clientX - dragRef.current.startX;
      const newY = e.clientY - dragRef.current.startY;
      setPosition({ x: newX, y: newY });
    }
    if (resizeRef.current.isResizing) {
      // Vertical bottom resize (including corners)
      if (
        resizeRef.current.direction === 'vertical' ||
        (typeof resizeRef.current.direction === 'string' && resizeRef.current.direction.includes('both'))
      ) {
        const deltaY = e.clientY - resizeRef.current.startY;
        const newHeight = Math.max(
          minHeight || 0,
          Math.min(
            resizeRef.current.startHeight + deltaY,
            maxHeight || window.innerHeight * 0.9
          )
        );
        setHeight(newHeight);
      }
      // Horizontal right resize
      if (
        resizeRef.current.direction === 'horizontal-right' ||
        resizeRef.current.direction === 'both-right'
      ) {
        const deltaX = e.clientX - resizeRef.current.startX;
        const newWidth = Math.max(
          minWidth,
          Math.min(
            resizeRef.current.startWidth + deltaX,
            maxWidth || window.innerWidth * 0.9
          )
        );
        setWidth(newWidth);
      }
      // Horizontal left resize (keeping right edge fixed)
      if (
        resizeRef.current.direction === 'horizontal-left' ||
        resizeRef.current.direction === 'both-left'
      ) {
        const rawDeltaX = e.clientX - resizeRef.current.startX;
        const possibleWidth = resizeRef.current.startWidth - rawDeltaX;
        const newWidth = Math.max(
          minWidth,
          Math.min(
            possibleWidth,
            maxWidth || window.innerWidth * 0.9
          )
        );
        const deltaWidth = resizeRef.current.startWidth - newWidth;
        const newX = resizeRef.current.startLeft + deltaWidth;
        setWidth(newWidth);
        setPosition((prev) => ({ x: newX, y: prev.y }));
      }
    }
  };

  const stopDragging = () => {
    dragRef.current.isDragging = false;
    resizeRef.current.isResizing = false;
  };

  React.useEffect(() => {
    if (isOpen) {
      window.addEventListener('mousemove', onDrag);
      window.addEventListener('mouseup', stopDragging);
      return () => {
        window.removeEventListener('mousemove', onDrag);
        window.removeEventListener('mouseup', stopDragging);
      };
    }
  }, [isOpen]);

  // Bring to front on any click
  const bringToFront = () => {
    setZIndex(bumpGlobalZIndex());
  };

  // Bring to front on mount or when opened
  useEffect(() => {
    if (isOpen) {
      bringToFront();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      ref={modalRef}
      className={`fixed bg-background/80 backdrop-blur-sm border rounded-lg shadow-lg ${className} group`}
      style={{ 
        left: position.x,
        top: position.y,
        height: isCollapsed ? 'auto' : (resizable ? height : 'auto'),
        width: resizable ? width : 'auto',
        minHeight: isCollapsed ? 'auto' : minHeight,
        minWidth,
        maxHeight: isCollapsed ? 'auto' : (resizable ? (maxHeight || window.innerHeight * 0.9) : 'none'),
        maxWidth: resizable ? (maxWidth || window.innerWidth * 0.9) : 'none',
        zIndex,
      }}
      onMouseDown={bringToFront}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between p-2 bg-secondary/50 cursor-move select-none rounded-t-lg"
        onMouseDown={startDragging}
      >
        <div className="flex items-center gap-2">
          {leftElement}
          <span className="text-sm font-medium">{title}</span>
        </div>
        <div className="flex items-center gap-1">
          {rightElement}
          <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => setIsCollapsed(!isCollapsed)}>
            {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="w-8 h-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      {!isCollapsed && (
        <>
          <div 
            ref={contentRef} 
            className={`modal-content overflow-auto ${resizable ? 'pb-2' : ''}`}
            style={{ 
              height: resizable ? 'calc(100% - 48px)' : 'auto',
              padding: '8px'
            }}
          >
            {children}
          </div>
          {resizable && (
            <>
              {/* Left resize handle */}
              <div
                className="absolute top-2 bottom-2 -left-px w-1 cursor-ew-resize bg-primary opacity-0 hover:opacity-100 transition-opacity duration-150 rounded-full"
                onMouseDown={(e) => startResizing(e, 'horizontal-left')}
              />
              {/* Bottom resize handle */}
              <div
                className="absolute -bottom-px left-0 right-0 h-1 cursor-ns-resize bg-primary opacity-0 hover:opacity-100 transition-opacity duration-150 rounded-full"
                onMouseDown={(e) => startResizing(e, 'vertical')}
              >
                <GripHorizontal className="h-3 w-3 text-muted-foreground" />
              </div>
              {/* Bottom-left corner resize handle */}
              <div
                className="absolute -bottom-px -left-px w-4 h-4 cursor-nesw-resize opacity-100 flex items-center justify-center"
                onMouseDown={(e) => startResizing(e, 'both-left')}
              >
                <GripHorizontal className="h-2 w-2 text-muted-foreground" />
              </div>
              {/* Right resize handle */}
              <div
                className="absolute top-2 bottom-2 -right-px w-1 cursor-ew-resize bg-primary opacity-0 hover:opacity-100 transition-opacity duration-150 rounded-full"
                onMouseDown={(e) => startResizing(e, 'horizontal-right')}
              />
              {/* Corner resize handle */}
              <div
                className="absolute -bottom-px -right-px w-4 h-4 cursor-nwse-resize opacity-100 flex items-center justify-center"
                onMouseDown={(e) => startResizing(e, 'both-right')}
              >
                <GripHorizontal className="h-2 w-2 text-muted-foreground" />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

DraggableModal.propTypes = {
  title: PropTypes.node.isRequired,
  children: PropTypes.node,
  defaultPosition: PropTypes.shape({
    x: PropTypes.number,
    y: PropTypes.number
  }),
  rightElement: PropTypes.node,
  leftElement: PropTypes.node,
  className: PropTypes.string,
  isOpen: PropTypes.bool,
  onClose: PropTypes.func,
  defaultCollapsed: PropTypes.bool,
  minHeight: PropTypes.oneOfType([
    PropTypes.number,
    PropTypes.string
  ]),
  maxHeight: PropTypes.oneOfType([
    PropTypes.number,
    PropTypes.string
  ]),
  minWidth: PropTypes.oneOfType([
    PropTypes.number,
    PropTypes.string
  ]),
  maxWidth: PropTypes.oneOfType([
    PropTypes.number,
    PropTypes.string
  ]),
  resizable: PropTypes.bool,
  defaultHeight: PropTypes.oneOfType([
    PropTypes.number,
    PropTypes.string
  ]),
  defaultWidth: PropTypes.oneOfType([
    PropTypes.number,
    PropTypes.string
  ])
};
