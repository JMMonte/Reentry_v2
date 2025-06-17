import React, { useMemo } from 'react';
import PropTypes from 'prop-types';

// Memoize the conversation starters array to prevent recreations
const conversationStarters = [
    // Earth Mission Examples
    "Create a Walker constellation with 24 satellites for global coverage.",
    "Design a sun-synchronous orbit for Earth observation missions.",
    "Place a communications satellite in geostationary orbit.",
    "Show me a Molniya orbit for Arctic communications coverage.",
    
    // Interplanetary Mission Examples
    "Create a Mars orbiter constellation for surface communications.",
    "Design a spacecraft orbiting Jupiter's moon Europa.",
    "Place a research satellite in lunar polar orbit.",
    "Show spacecraft orbiting Saturn's moon Titan.",
    
    // Mission Analysis & Control
    "Analyze ground track coverage for my Mars satellites.",
    "Calculate orbital periods for different altitudes around Venus.",
    "Show me all available celestial bodies for mission planning.",
    "Fast-forward time to see orbital mechanics in action.",
    
    // Advanced Solar System Operations
    "Create asteroid belt monitoring satellites around Ceres.",
    "Design a deep space relay network using Lagrange points.",
    "Simulate a grand tour mission visiting multiple planets.",
    "Monitor spacecraft health across my entire fleet.",
    
    // Creative Mission Concepts
    "Create a beautiful orbital pattern around multiple moons of Jupiter.",
    "Design a constellation that follows the orbital dance of planets.",
    "Show me how spacecraft move through different spheres of influence.",
    "Create a real-time mission control dashboard for my fleet."
];

// Memoized individual starter button component
const StarterButton = React.memo(function StarterButton({ starter, onClick, index }) {
    return (
        <button
            key={index}
            className="w-full text-left px-4 py-3 rounded-xl bg-secondary shadow-sm border border-border hover:bg-primary/10 transition-colors text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 break-words min-h-[56px]"
            onClick={onClick}
            type="button"
        >
            {starter}
        </button>
    );
});

StarterButton.propTypes = {
    starter: PropTypes.string.isRequired,
    onClick: PropTypes.func.isRequired,
    index: PropTypes.number.isRequired
};

const ChatStarters = React.memo(function ChatStarters({ onSelect }) {
    // Memoize the handlers to prevent recreations
    const starterHandlers = useMemo(() => {
        return conversationStarters.map((starter) => () => onSelect(starter));
    }, [onSelect]);

    return (
        <>
            {conversationStarters.map((starter, idx) => (
                <StarterButton
                    key={idx}
                    starter={starter}
                    onClick={starterHandlers[idx]}
                    index={idx}
                />
            ))}
        </>
    );
});

ChatStarters.propTypes = {
    onSelect: PropTypes.func.isRequired
};

export default ChatStarters; 