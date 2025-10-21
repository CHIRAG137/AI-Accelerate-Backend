const axios = require('axios');
const vm = require('vm');

exports.buildNodeMap = (flow) => {
  const nodeMap = {};
  for (const n of flow.nodes || []) {
    nodeMap[String(n.id)] = n;
  }
  return nodeMap;
};

exports.getNode = (nodeMap, nodeId) => {
  return nodeMap[String(nodeId)] || null;
};

exports.outgoingEdges = (edges, nodeId) => {
  return edges.filter((e) => String(e.source) === String(nodeId));
};

exports.findEdgeByHandle = (edges, nodeId, handleValue) => {
  const outs = exports.outgoingEdges(edges, nodeId);
  const normalized = String(handleValue).toLowerCase();

  let edge = outs.find(
    (o) => o.sourceHandle && String(o.sourceHandle).toLowerCase() === normalized
  );
  if (edge) return edge;

  if (outs.length === 1 && !outs[0].sourceHandle) return outs[0];
  return null;
};

exports.findBranchOptionNode = (nodeMap, branchNode, optionIndexOrLabel) => {
  const options = (branchNode.data && branchNode.data.options) || [];
  const idx = Number(optionIndexOrLabel);

  if (!isNaN(idx) && options[idx] !== undefined) {
    for (const node of Object.values(nodeMap)) {
      if (node.type === "branchOption" && node.data?.label === options[idx]) {
        return node.id;
      }
    }
    const guessed = `${branchNode.id}-opt-${idx}`;
    if (exports.getNode(nodeMap, guessed)) return guessed;
  } else {
    const label = String(optionIndexOrLabel);
    for (const node of Object.values(nodeMap)) {
      if (node.type === "branchOption" && node.data?.label === label) {
        return node.id;
      }
    }
  }
  return null;
};

/**
 * Execute code node with sandboxed environment
 */
exports.executeCodeNode = async (codeNode, session) => {
  try {
    const code = codeNode.data?.code || '';
    const timeout = codeNode.data?.timeout || 5000;
    
    if (!code.trim()) {
      return {
        success: false,
        result: null,
        error: 'No code provided',
      };
    }
    
    // Create a mutable variables object
    const variablesProxy = { ...session.variables };
    
    // Create a sandbox with available utilities and session variables
    const sandbox = {
      // Session variables - direct access
      variables: variablesProxy,
      
      // HTTP client
      axios: axios,
      
      // Console for logging
      console: {
        log: (...args) => console.log('[Code Node]', ...args),
        error: (...args) => console.error('[Code Node]', ...args),
        warn: (...args) => console.warn('[Code Node]', ...args),
      },
      
      // Result storage
      result: null,
      error: null,
      
      // Helper functions - using arrow functions to maintain context
      setVariable: (key, value) => {
        variablesProxy[key] = value;
      },
      
      getVariable: (key) => {
        return variablesProxy[key];
      },
      
      // Global objects that might be needed
      JSON: JSON,
      Math: Math,
      Date: Date,
      Promise: Promise,
      setTimeout: setTimeout,
      setInterval: setInterval,
      clearTimeout: clearTimeout,
      clearInterval: clearInterval,
    };

    const context = vm.createContext(sandbox);
    
    // Wrap code in async IIFE to support await
    const wrappedCode = `
      (async () => {
        try {
          ${code}
        } catch (err) {
          error = err.message;
          throw err;
        }
      })();
    `;

    const script = new vm.Script(wrappedCode);
    await script.runInContext(context, {
      timeout: timeout,
      displayErrors: true,
    });

    // Update session variables with any changes from the proxy
    Object.assign(session.variables, variablesProxy);

    return {
      success: true,
      result: sandbox.result,
      variables: variablesProxy,
      error: sandbox.error,
    };
  } catch (error) {
    console.error('Code execution error:', error);
    return {
      success: false,
      result: null,
      error: error.message || 'Code execution failed',
    };
  }
};

exports.runFrom = async (flow, session, nodeId, userInputIfAny = null) => {
  const nodeMap = exports.buildNodeMap(flow);
  const edges = flow.edges || [];
  const outputs = [];
  let current = exports.getNode(nodeMap, nodeId);

  while (current && !session.isFinished) {
    const type = current.type;

    if (type === "message") {
      outputs.push({
        nodeId: current.id,
        type: "message",
        content: current.data?.message || "",
      });
      const outs = exports.outgoingEdges(edges, current.id);
      if (!outs.length) {
        session.currentNodeId = null;
        session.isFinished = true;
        break;
      }
      current = exports.getNode(nodeMap, outs[0].target);
      continue;
    }

    if (type === "redirect") {
      outputs.push({
        nodeId: current.id,
        type: "redirect",
        content: current.data?.redirectUrl || "",
      });
      session.currentNodeId = null;
      session.isFinished = true;
      break;
    }

    if (type === "question") {
      if (userInputIfAny === null) {
        return {
          outputs,
          pausedFor: {
            type: "question",
            nodeId: current.id,
            message: current.data?.message,
            variable: current.data?.variable,
          },
        };
      }
      const varName = current.data?.variable;
      if (varName) session.variables[varName] = userInputIfAny;

      outputs.push({
        nodeId: current.id,
        type: "question",
        content: {
          prompt: current.data?.message,
          answer: userInputIfAny,
          variable: varName,
        },
      });

      const outs = exports.outgoingEdges(edges, current.id);
      if (!outs.length) {
        session.currentNodeId = null;
        session.isFinished = true;
        break;
      }
      current = exports.getNode(nodeMap, outs[0].target);
      userInputIfAny = null;
      continue;
    }

    if (type === "confirmation") {
      if (userInputIfAny === null) {
        return {
          outputs,
          pausedFor: {
            type: "confirmation",
            nodeId: current.id,
            message: current.data?.message,
          },
        };
      }

      const normalized = String(userInputIfAny).toLowerCase();
      outputs.push({
        nodeId: current.id,
        type: "confirmation",
        content: {
          prompt: current.data?.message,
          answer: normalized,
        },
      });

      const edge = exports.findEdgeByHandle(edges, current.id, normalized);
      if (!edge) {
        session.isFinished = true;
        break;
      }
      current = exports.getNode(nodeMap, edge.target);
      userInputIfAny = null;
      continue;
    }

    if (type === "branch") {
      return {
        outputs,
        pausedFor: {
          type: "branch",
          nodeId: current.id,
          message: current.data?.message,
          options: current.data?.options || [],
        },
      };
    }

    if (type === "branchOption") {
      const outs = exports.outgoingEdges(edges, current.id);
      if (!outs.length) {
        session.isFinished = true;
        break;
      }
      current = exports.getNode(nodeMap, outs[0].target);
      continue;
    }

    // Code Node Handler
    if (type === "code") {
      console.log('[Flow Engine] Executing code node:', current.id);
      console.log('[Flow Engine] Session variables before:', session.variables);
      
      const execution = await exports.executeCodeNode(current, session);
      
      console.log('[Flow Engine] Code execution result:', execution);
      console.log('[Flow Engine] Session variables after:', session.variables);
      
      if (!execution.success) {
        outputs.push({
          nodeId: current.id,
          type: "code",
          content: {
            error: execution.error,
            success: false,
            timestamp: new Date(),
          },
        });
        
        // Check if there's an error handle
        const errorEdge = exports.findEdgeByHandle(edges, current.id, "error");
        if (errorEdge) {
          current = exports.getNode(nodeMap, errorEdge.target);
          continue;
        } else {
          // No error handler, end the flow
          session.isFinished = true;
          break;
        }
      }
      
      outputs.push({
        nodeId: current.id,
        type: "code",
        content: {
          result: execution.result,
          success: true,
          timestamp: new Date(),
        },
      });
      
      // Continue to next node via success handle or default edge
      const successEdge = exports.findEdgeByHandle(edges, current.id, "success");
      if (successEdge) {
        current = exports.getNode(nodeMap, successEdge.target);
      } else {
        const outs = exports.outgoingEdges(edges, current.id);
        if (outs.length > 0) {
          current = exports.getNode(nodeMap, outs[0].target);
        } else {
          session.currentNodeId = null;
          session.isFinished = true;
          break;
        }
      }
      continue;
    }

    outputs.push({
      nodeId: current.id,
      type: "unknown",
      content: current.data || {},
    });
    session.currentNodeId = null;
    session.isFinished = true;
    break;
  }

  return {
    outputs,
    pausedFor: null,
    nextNodeId: current ? current.id : null,
  };
};

exports.findStartNode = (flow) => {
  const nodeMap = exports.buildNodeMap(flow);
  if (exports.getNode(nodeMap, "1")) return exports.getNode(nodeMap, "1");
  return (flow.nodes || [])[0] || null;
};
