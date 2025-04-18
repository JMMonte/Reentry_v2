import React from 'react';
import PropTypes from 'prop-types';

const conversationStarters = [
    "Create a Walker constellation with 24 satellites.",
    "Show me a sun-synchronous orbit for Earth observation.",
    "Design a spacecraft in a Molniya orbit.",
    "Create a custom constellation with 6 planes and 4 satellites per plane.",
    "Place a satellite in a geostationary orbit.",
    "Show a spacecraft in a lunar transfer orbit.",
    // Fun and creative starters
    "Create a Galileo constellation analogue.",
    "Create a nice geometric satellite constellation art around the Earth.",
    "Create satellites over each city in Europe moving eastward.",
    "Simulate a mega-constellation for global internet coverage.",
    "Arrange satellites in a flower-shaped pattern around the planet.",
    "Put a satellite in a retrograde orbit.",
    "Create a constellation for continuous coverage of the North Pole.",
    "Design a constellation for tracking ships across all oceans.",
    "Show a satellite in a highly elliptical orbit passing over Antarctica."
];

const ChatStarters = ({ onSelect }) => (
    <>
        {conversationStarters.map((starter, idx) => (
            <button
                key={idx}
                className="w-full text-left px-4 py-3 rounded-xl bg-secondary shadow-sm border border-border hover:bg-primary/10 transition-colors text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 break-words min-h-[56px]"
                onClick={() => onSelect(starter)}
                type="button"
            >
                {starter}
            </button>
        ))}
    </>
);

ChatStarters.propTypes = {
    onSelect: PropTypes.func.isRequired
};

export default ChatStarters; 