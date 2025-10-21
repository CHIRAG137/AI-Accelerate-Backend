window.ChatBotWidget = {
  config: null,
  button: null,
  iframe: null,
  isInitialized: false,
  customization: null,

  init: function (config) {
    // Prevent running inside iframe
    if (window.self !== window.top) return;

    // Validate required config
    if (!config || !config.botId) {
      console.error('ChatBotWidget: botId is required');
      return;
    }

    // Store config
    this.config = config;

    // Fetch customization from backend, then render
    this.fetchCustomization();

    // Listen for route changes (for SPAs like React Router)
    this.setupRouteChangeListeners();

    this.isInitialized = true;
  },

  fetchCustomization: async function() {
    try {
      const response = await fetch(
        `https://ai-accelerate-backend.onrender.com/api/bots/customisation/${this.config.botId}`
      );
      const data = await response.json();
      
      this.customization = data.result || {};
      console.log('ChatBotWidget: Customization loaded', this.customization);
      
      // Initial check and render after customization is loaded
      this.checkAndRender();
    } catch (error) {
      console.error('ChatBotWidget: Error loading customization', error);
      // Render with default settings if fetch fails
      this.customization = {};
      this.checkAndRender();
    }
  },

  checkAndRender: function() {
    const shouldShow = this.shouldShowOnCurrentPage(this.config.allowedPages);
    
    if (shouldShow) {
      this.showWidget();
    } else {
      this.hideWidget();
    }
  },

  showWidget: function() {
    // If widget already exists and is visible, do nothing
    if (this.button && this.iframe) {
      this.button.style.display = 'flex';
      console.log('ChatBotWidget: Widget shown');
      return;
    }

    // Create widget if it doesn't exist
    if (!this.button || !this.iframe) {
      this.createWidget();
    }
  },

  hideWidget: function() {
    console.log('ChatBotWidget: Hiding widget - not allowed on this page');
    
    if (this.button) {
      this.button.style.display = 'none';
    }
    if (this.iframe) {
      this.iframe.style.display = 'none';
    }
  },

  applyCustomStyles: function(element, customStyles, defaultStyles) {
    // Apply default styles first
    Object.assign(element.style, defaultStyles);
    
    // Then apply custom styles if provided (these will override defaults)
    if (customStyles && typeof customStyles === 'object') {
      Object.assign(element.style, customStyles);
    }
  },

  createWidget: function() {
    // Prevent duplication
    if (document.getElementById("chatbot-widget-button") || document.getElementById("chatbot-widget-iframe")) {
      return;
    }

    // Get button customization from backend or use defaults
    const buttonCustomization = this.customization || {};
    const useButtonCustomCSS = buttonCustomization.useButtonCustomCSS || false;
    
    // Create a style tag for button hover and animations
    const style = document.createElement("style");
    
    // Default CSS classes
    let defaultCSS = `
      #chatbot-widget-button:hover {
        transform: scale(1.05);
        box-shadow: 0 6px 12px rgba(0, 0, 0, 0.3);
      }
      @keyframes fadeIn {
        from { opacity: 0; transform: scale(0.95); }
        to { opacity: 1; transform: scale(1); }
      }
    `;
    
    // If user provided custom button CSS from backend, append it
    if (useButtonCustomCSS && buttonCustomization.buttonCustomCSS) {
      defaultCSS += '\n' + buttonCustomization.buttonCustomCSS;
    }
    
    // If user provided custom CSS via init config, append it (backward compatibility)
    if (this.config.customCSS) {
      defaultCSS += '\n' + this.config.customCSS;
    }
    
    style.innerHTML = defaultCSS;
    document.head.appendChild(style);

    // Create the floating circular button
    this.button = document.createElement("button");
    this.button.id = "chatbot-widget-button";
    this.button.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" height="24" width="24" fill="white" viewBox="0 0 24 24">
        <path d="M2 2v20l4-4h14V2H2zm16 10H6v-2h12v2z"/>
      </svg>
    `;
    
    // Determine position from backend or config
    const position = buttonCustomization.buttonPosition || this.config.position || "bottom-right";
    const buttonSize = buttonCustomization.buttonSize || "56";
    const buttonBorderRadius = buttonCustomization.buttonBorderRadius || "50";
    const buttonBackground = buttonCustomization.buttonBackground || "linear-gradient(135deg, #9b5de5, #f15bb5)";
    const buttonColor = buttonCustomization.buttonColor || "#ffffff";
    const buttonBottom = buttonCustomization.buttonBottom || "20";
    const buttonRight = buttonCustomization.buttonRight || "20";
    const buttonLeft = buttonCustomization.buttonLeft || "20";
    
    // Update SVG fill color
    if (buttonColor) {
      this.button.querySelector('svg').setAttribute('fill', buttonColor);
    }
    
    // Default button styles
    const defaultButtonStyles = {
      position: "fixed",
      bottom: buttonBottom + "px",
      right: position === "bottom-left" ? "auto" : buttonRight + "px",
      left: position === "bottom-left" ? buttonLeft + "px" : "auto",
      zIndex: "9999",
      background: buttonBackground,
      color: buttonColor,
      border: "none",
      borderRadius: buttonBorderRadius + "%",
      width: buttonSize + "px",
      height: buttonSize + "px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: "0 4px 10px rgba(0,0,0,0.3)",
      cursor: "pointer",
      transition: "transform 0.2s, box-shadow 0.2s",
    };
    
    // If using custom button CSS, only apply positioning and display properties
    if (useButtonCustomCSS) {
      Object.assign(this.button.style, {
        position: "fixed",
        bottom: buttonBottom + "px",
        right: position === "bottom-left" ? "auto" : buttonRight + "px",
        left: position === "bottom-left" ? buttonLeft + "px" : "auto",
        zIndex: "9999",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        border: "none",
        transition: "transform 0.2s, box-shadow 0.2s",
      });
    } else {
      // Apply default styles and custom button styles from config if provided
      this.applyCustomStyles(this.button, this.config.buttonStyles, defaultButtonStyles);
    }

    // Create the iframe (initially hidden)
    this.iframe = document.createElement("iframe");
    this.iframe.id = "chatbot-widget-iframe";
    this.iframe.src = `${this.config.apiUrl}/embed?botId=${this.config.botId}`;
    
    // Default iframe styles
    const defaultIframeStyles = {
      position: "fixed",
      bottom: "90px",
      right: position === "bottom-left" ? "auto" : buttonRight + "px",
      left: position === "bottom-left" ? buttonLeft + "px" : "auto",
      width: "360px",
      height: "500px",
      border: "none",
      borderRadius: "12px",
      zIndex: "9999",
      display: "none",
      animation: "fadeIn 0.3s ease-out",
      boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
    };
    
    // Apply default styles and custom iframe styles if provided
    this.applyCustomStyles(this.iframe, this.config.iframeStyles, defaultIframeStyles);

    // Toggle iframe visibility on button click
    const self = this;
    this.button.addEventListener("click", function() {
      if (self.iframe.style.display === "none") {
        self.iframe.style.display = "block";
      } else {
        self.iframe.style.display = "none";
      }
    });

    // Append elements to the DOM
    document.body.appendChild(this.button);
    document.body.appendChild(this.iframe);

    console.log('ChatBotWidget: Widget created successfully');
  },

  setupRouteChangeListeners: function() {
    const self = this;

    // Listen for popstate (browser back/forward buttons)
    window.addEventListener('popstate', function() {
      console.log('ChatBotWidget: Route changed (popstate)');
      setTimeout(function() {
        self.checkAndRender();
      }, 100);
    });

    // Listen for pushState and replaceState (React Router navigation)
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function() {
      originalPushState.apply(this, arguments);
      console.log('ChatBotWidget: Route changed (pushState)');
      setTimeout(function() {
        self.checkAndRender();
      }, 100);
    };

    history.replaceState = function() {
      originalReplaceState.apply(this, arguments);
      console.log('ChatBotWidget: Route changed (replaceState)');
      setTimeout(function() {
        self.checkAndRender();
      }, 100);
    };

    // Also listen for hashchange (for hash-based routing)
    window.addEventListener('hashchange', function() {
      console.log('ChatBotWidget: Route changed (hashchange)');
      setTimeout(function() {
        self.checkAndRender();
      }, 100);
    });

    console.log('ChatBotWidget: Route change listeners set up');
  },

  shouldShowOnCurrentPage: function(allowedPages) {
    // If no allowedPages specified, show on all pages
    if (!allowedPages || allowedPages.length === 0) {
      return true;
    }

    const currentUrl = window.location.href;
    const currentPath = window.location.pathname;
    const currentOrigin = window.location.origin;

    console.log('ChatBotWidget: Checking page access', {
      currentUrl: currentUrl,
      currentPath: currentPath,
      allowedPages: allowedPages
    });

    // Check each allowed page pattern
    for (let i = 0; i < allowedPages.length; i++) {
      const pattern = allowedPages[i];
      if (this.matchesPattern(pattern, currentUrl, currentPath, currentOrigin)) {
        console.log('ChatBotWidget: Page matched pattern:', pattern);
        return true;
      }
    }

    console.log('ChatBotWidget: No pattern matched. Widget will not be shown.');
    return false;
  },

  matchesPattern: function(pattern, currentUrl, currentPath, currentOrigin) {
    // Remove trailing slashes for consistent comparison
    const normalizedPattern = pattern.replace(/\/$/, '');
    const normalizedUrl = currentUrl.replace(/\/$/, '');
    const normalizedPath = currentPath.replace(/\/$/, '');

    // 1. Exact URL match
    if (normalizedPattern === normalizedUrl) {
      return true;
    }

    // 2. Exact path match
    if (normalizedPattern === normalizedPath) {
      return true;
    }

    // 3. Path-only pattern (starts with /)
    if (pattern.startsWith('/')) {
      // Check if pattern contains wildcard
      if (pattern.includes('*')) {
        return this.wildcardMatch(pattern, currentPath);
      }
      
      // Check if pattern is a base path (e.g., /edit should match /edit/123)
      if (currentPath.startsWith(normalizedPattern + '/')) {
        return true;
      }
      
      // Exact path match already checked above
      return false;
    }

    // 4. Full URL with wildcard
    if (pattern.includes('*')) {
      return this.wildcardMatch(pattern, currentUrl);
    }

    // 5. Relative path match (append to origin)
    const fullPatternUrl = pattern.startsWith('http') 
      ? pattern 
      : currentOrigin + (pattern.startsWith('/') ? '' : '/') + pattern;
    
    if (fullPatternUrl.replace(/\/$/, '') === normalizedUrl) {
      return true;
    }

    return false;
  },

  wildcardMatch: function(pattern, str) {
    // Remove trailing slashes for consistent matching
    const normalizedPattern = pattern.replace(/\/$/, '');
    const normalizedStr = str.replace(/\/$/, '');
    
    // Convert wildcard pattern to regex
    // Escape special regex characters except *
    const escapeRegex = function(s) {
      return s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    };
    
    // Split by * and escape each part, then join with .*
    const parts = normalizedPattern.split('*');
    const escapedParts = [];
    for (let i = 0; i < parts.length; i++) {
      escapedParts.push(escapeRegex(parts[i]));
    }
    const regexPattern = '^' + escapedParts.join('.*') + '$';
    
    const regex = new RegExp(regexPattern);
    return regex.test(normalizedStr);
  }
};
