import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Button } from '../button';
import { ChevronDown, ChevronUp, X, GripHorizontal } from 'lucide-react';
import PropTypes from 'prop-types';

// Module-level z-index tracker (now truly global)
if (typeof window !== 'undefined') {
  if (!window.__GLOBAL_MODAL_Z_INDEX__) window.__GLOBAL_MODAL_Z_INDEX__ = 9999;
}
const getGlobalZIndex = () => (typeof window !== 'undefined' ? window.__GLOBAL_MODAL_Z_INDEX__ : 9999);
const bumpGlobalZIndex = () => (typeof window !== 'undefined' ? ++window.__GLOBAL_MODAL_Z_INDEX__ : 10000);

// Performance throttle function for mouse events
function throttle(func, delay) {
  let timeoutId;
  let lastExecTime = 0;
  return function (...args) {
    const currentTime = Date.now();
    
    if (currentTime - lastExecTime > delay) {
      func.apply(this, args);
      lastExecTime = currentTime;
    } else {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        func.apply(this, args);
        lastExecTime = Date.now();
      }, delay - (currentTime - lastExecTime));
    }
  };
}

// Memoized modal header component
const ModalHeader = React.memo(function ModalHeader({
  title,
  leftElement,
  isCollapsed,
  onToggleCollapse,
  onClose,
  rightElement,
  onStartDragging
}) {
  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    onStartDragging(e);
  }, [onStartDragging]);

  return (
    <div 
      className="flex items-center justify-between p-3 border-b bg-card cursor-move select-none"
      onMouseDown={handleMouseDown}
    >
      <div className="flex items-center space-x-2">
        {leftElement}
        <GripHorizontal className="h-4 w-4 opacity-50" />
        <span className="text-sm font-medium">
          {title}
        </span>
      </div>
      <div className="flex items-center space-x-2">
        {rightElement}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleCollapse}
          className="h-6 w-6"
        >
          {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-6 w-6"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
});

ModalHeader.propTypes = {
  title: PropTypes.oneOfType([PropTypes.string, PropTypes.node]).isRequired,
  leftElement: PropTypes.node,
  isCollapsed: PropTypes.bool.isRequired,
  onToggleCollapse: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  rightElement: PropTypes.node,
  onStartDragging: PropTypes.func.isRequired
};

// Memoized resize handle component
const ResizeHandle = React.memo(function ResizeHandle({ direction, onStartResize }) {
  const handleMouseDown = useCallback((e) => {
    onStartResize(e, direction);
  }, [onStartResize, direction]);

  const getHandleStyles = useCallback(() => {
    const baseStyles = 'absolute bg-transparent hover:bg-blue-500/20 transition-colors';
    
    switch (direction) {
      case 'vertical':
        return `${baseStyles} bottom-0 left-0 right-0 h-2 cursor-ns-resize`;
      case 'horizontal-right':
        return `${baseStyles} top-0 bottom-0 right-0 w-2 cursor-ew-resize`;
      case 'horizontal-left':
        return `${baseStyles} top-0 bottom-0 left-0 w-2 cursor-ew-resize`;
      case 'both-right':
        return `${baseStyles} bottom-0 right-0 w-4 h-4 cursor-nwse-resize`;
      case 'both-left':
        return `${baseStyles} bottom-0 left-0 w-4 h-4 cursor-nesw-resize`;
      default:
        return baseStyles;
    }
  }, [direction]);

  return (
    <div
      className={getHandleStyles()}
      onMouseDown={handleMouseDown}
    />
  );
});

ResizeHandle.propTypes = {
  direction: PropTypes.string.isRequired,
  onStartResize: PropTypes.func.isRequired
};

// Main modal component with comprehensive performance optimizations
export const DraggableModal = React.memo(function DraggableModal({ 
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
  const [isMobile, setIsMobile] = useState(false);
  
  // Memoized constraints calculation
  const constraints = useMemo(() => ({
    maxHeight: maxHeight || (typeof window !== 'undefined' ? window.innerHeight * 0.9 : 600),
    maxWidth: maxWidth || (typeof window !== 'undefined' ? window.innerWidth * 0.9 : 800),
    minHeight: minHeight || 0,
    minWidth
  }), [maxHeight, maxWidth, minHeight, minWidth]);

  // Memoized RAF position updater
  const updatePositionRAF = useRef();
  const updatePosition = useCallback((newPosition) => {
    if (updatePositionRAF.current) {
      cancelAnimationFrame(updatePositionRAF.current);
    }
    updatePositionRAF.current = requestAnimationFrame(() => {
      setPosition(newPosition);
    });
  }, []);

  // Memoized RAF size updater
  const updateSizeRAF = useRef();
  const updateSize = useCallback((newSize) => {
    if (updateSizeRAF.current) {
      cancelAnimationFrame(updateSizeRAF.current);
    }
    updateSizeRAF.current = requestAnimationFrame(() => {
      if (newSize.width !== undefined) setWidth(newSize.width);
      if (newSize.height !== undefined) setHeight(newSize.height);
      if (newSize.position) setPosition(newSize.position);
    });
  }, []);

  // Memoized event handlers to prevent recreation
  const handleToggleCollapse = useCallback(() => {
    setIsCollapsed(prev => !prev);
  }, []);

  const startDragging = useCallback((e) => {
    // Bring this modal to front
    setZIndex(bumpGlobalZIndex());
    dragRef.current = {
      isDragging: true,
      startX: e.clientX - position.x,
      startY: e.clientY - position.y,
    };
  }, [position]);

  const startResizing = useCallback((e, direction) => {
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
  }, [position.x]);

  // Memoized throttled drag handler for better performance
  const onDrag = useMemo(() => throttle((e) => {
    if (dragRef.current.isDragging) {
      const newX = e.clientX - dragRef.current.startX;
      const newY = e.clientY - dragRef.current.startY;
      updatePosition({ x: newX, y: newY });
    }
    if (resizeRef.current.isResizing) {
      const updates = {};
      
      // Vertical bottom resize (including corners)
      if (
        resizeRef.current.direction === 'vertical' ||
        (typeof resizeRef.current.direction === 'string' && resizeRef.current.direction.includes('both'))
      ) {
        const deltaY = e.clientY - resizeRef.current.startY;
        const newHeight = Math.max(
          constraints.minHeight,
          Math.min(resizeRef.current.startHeight + deltaY, constraints.maxHeight)
        );
        updates.height = newHeight;
      }
      
      // Horizontal right resize
      if (
        resizeRef.current.direction === 'horizontal-right' ||
        resizeRef.current.direction === 'both-right'
      ) {
        const deltaX = e.clientX - resizeRef.current.startX;
        const newWidth = Math.max(
          constraints.minWidth,
          Math.min(resizeRef.current.startWidth + deltaX, constraints.maxWidth)
        );
        updates.width = newWidth;
      }
      
      // Horizontal left resize (keeping right edge fixed)
      if (
        resizeRef.current.direction === 'horizontal-left' ||
        resizeRef.current.direction === 'both-left'
      ) {
        const rawDeltaX = e.clientX - resizeRef.current.startX;
        const possibleWidth = resizeRef.current.startWidth - rawDeltaX;
        const newWidth = Math.max(
          constraints.minWidth,
          Math.min(possibleWidth, constraints.maxWidth)
        );
        const deltaWidth = resizeRef.current.startWidth - newWidth;
        const newX = resizeRef.current.startLeft + deltaWidth;
        updates.width = newWidth;
        updates.position = { x: newX, y: position.y };
      }
      
      if (Object.keys(updates).length > 0) {
        updateSize(updates);
      }
    }
  }, 16), [constraints, position.y, updatePosition, updateSize]); // ~60fps throttling

  const stopDragging = useCallback(() => {
    dragRef.current.isDragging = false;
    resizeRef.current.isResizing = false;
  }, []);

  // Memoized mobile check handler
  const checkMobile = useCallback(() => {
    setIsMobile(window.innerWidth <= 640);
  }, []);

  // Update dimensions based on content only for resizable modals
  useEffect(() => {
    if (resizable && !isCollapsed && contentRef.current && height === 'auto') {
      const contentHeight = contentRef.current.scrollHeight;
      const maxDefaultHeight = constraints.maxHeight;
      if (contentHeight < maxDefaultHeight) {
        setHeight(contentHeight);
      } else {
        setHeight(maxDefaultHeight);
      }
    }
  }, [isCollapsed, children, resizable, height, constraints.maxHeight]);

  useEffect(() => {
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [checkMobile]);

  // Event listeners for drag and resize - memoized to prevent recreation
  useEffect(() => {
    const checkActive = () => {
      return dragRef.current.isDragging || resizeRef.current.isResizing;
    };

    const conditionalOnDrag = (e) => {
      if (checkActive()) onDrag(e);
    };

    const conditionalStopDragging = () => {
      if (checkActive()) stopDragging();
    };

    document.addEventListener('mousemove', conditionalOnDrag);
    document.addEventListener('mouseup', conditionalStopDragging);

    return () => {
      document.removeEventListener('mousemove', conditionalOnDrag);
      document.removeEventListener('mouseup', conditionalStopDragging);
    };
  }, [onDrag, stopDragging]);

  // Memoized modal styles
  const modalStyles = useMemo(() => {
    const baseStyles = {
      position: 'fixed',
      left: `${position.x}px`,
      top: `${position.y}px`,
      zIndex: zIndex,
      minWidth: `${constraints.minWidth}px`,
      maxWidth: constraints.maxWidth ? `${constraints.maxWidth}px` : undefined,
      width: width !== 'auto' ? `${width}px` : 'auto',
      backgroundColor: 'hsl(var(--card))',
      border: '1px solid hsl(var(--border))',
      borderRadius: 'calc(var(--radius) - 2px)',
      boxShadow: 'var(--shadow)',
    };

    if (isMobile) {
      return {
        ...baseStyles,
        left: '10px',
        top: '10px',
        right: '10px',
        width: 'calc(100vw - 20px)',
        maxWidth: 'calc(100vw - 20px)',
        position: 'fixed'
      };
    }

    return baseStyles;
  }, [position, zIndex, constraints, width, isMobile]);

  // Memoized content styles
  const contentStyles = useMemo(() => {
    const baseStyles = {
      transition: 'max-height 0.2s ease-out',
      overflow: 'auto',
    };

    if (isCollapsed) {
      return {
        ...baseStyles,
        maxHeight: '0px',
        padding: '0px',
        overflow: 'hidden'
      };
    }

    if (height !== 'auto') {
      return {
        ...baseStyles,
        height: `${height}px`,
        maxHeight: `${constraints.maxHeight}px`
      };
    }

    return {
      ...baseStyles,
      maxHeight: `${constraints.maxHeight}px`
    };
  }, [isCollapsed, height, constraints.maxHeight]);

  if (!isOpen) return null;

  return (
    <div
      ref={modalRef}
      className={`bg-card text-card-foreground shadow-lg ${className}`}
      style={modalStyles}
    >
      <ModalHeader
        title={title}
        leftElement={leftElement}
        isCollapsed={isCollapsed}
        onToggleCollapse={handleToggleCollapse}
        onClose={onClose}
        rightElement={rightElement}
        onStartDragging={startDragging}
      />
      
      <div
        ref={contentRef}
        className="p-2"
        style={contentStyles}
      >
        {children}
      </div>

      {resizable && !isMobile && (
        <>
          <ResizeHandle direction="vertical" onStartResize={startResizing} />
          <ResizeHandle direction="horizontal-right" onStartResize={startResizing} />
          <ResizeHandle direction="horizontal-left" onStartResize={startResizing} />
          <ResizeHandle direction="both-right" onStartResize={startResizing} />
          <ResizeHandle direction="both-left" onStartResize={startResizing} />
        </>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for optimal performance
  return prevProps.title === nextProps.title &&
    prevProps.isOpen === nextProps.isOpen &&
    prevProps.defaultCollapsed === nextProps.defaultCollapsed &&
    prevProps.className === nextProps.className &&
    prevProps.resizable === nextProps.resizable &&
    prevProps.minHeight === nextProps.minHeight &&
    prevProps.maxHeight === nextProps.maxHeight &&
    prevProps.minWidth === nextProps.minWidth &&
    prevProps.maxWidth === nextProps.maxWidth &&
    prevProps.defaultHeight === nextProps.defaultHeight &&
    prevProps.defaultWidth === nextProps.defaultWidth &&
    JSON.stringify(prevProps.defaultPosition) === JSON.stringify(nextProps.defaultPosition) &&
    prevProps.children === nextProps.children &&
    prevProps.onClose === nextProps.onClose;
});

DraggableModal.propTypes = {
  title: PropTypes.oneOfType([PropTypes.string, PropTypes.node]).isRequired,
  children: PropTypes.node.isRequired,
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
  minHeight: PropTypes.number,
  maxHeight: PropTypes.number,
  minWidth: PropTypes.number,
  maxWidth: PropTypes.number,
  resizable: PropTypes.bool,
  defaultHeight: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  defaultWidth: PropTypes.oneOfType([PropTypes.number, PropTypes.string])
};

export default DraggableModal;