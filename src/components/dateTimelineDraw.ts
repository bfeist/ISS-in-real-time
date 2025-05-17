import paper from "paper";

const createInteractiveElements = (): void => {
  // Assumes paper.setup has been called and paper.view is available.
  // The project associated with the current canvas will be active.
  const circle = new paper.Path.Circle(paper.view.center, 50);
  circle.fillColor = new paper.Color("blue");
};

export const initializePaperCanvas = (
  canvasElement: HTMLCanvasElement, // Renamed for clarity
  onMouseMoveCallback: (content: CanvasCallbackContent) => void
): {
  resizeHandler: () => void;
  cleanupInputHandlers: () => void; // Added for specific cleanup
} => {
  paper.setup(canvasElement);

  createInteractiveElements();
  let verticalLine: paper.Path.Line | null = null;
  let isMouseCurrentlyOverCanvas = false; // Flag to track mouse state

  const tool = new paper.Tool();

  tool.onMouseMove = (event: paper.ToolEvent) => {
    if (!isMouseCurrentlyOverCanvas) {
      isMouseCurrentlyOverCanvas = true;
      // First move over the canvas, Paper.js tool takes over for coords
    }

    if (verticalLine) {
      verticalLine.remove();
    }
    verticalLine = new paper.Path.Line(
      new paper.Point(event.point.x, paper.view.bounds.top),
      new paper.Point(event.point.x, paper.view.bounds.bottom)
    );
    verticalLine.strokeColor = new paper.Color("red");
    verticalLine.strokeWidth = 1;

    onMouseMoveCallback({
      mouseX: event.point.x,
      mouseY: event.point.y,
      canvasWidth: paper.view.bounds.width,
    });
  };

  tool.activate();

  const handleDocumentMouseMove = (event: MouseEvent) => {
    const rect = canvasElement.getBoundingClientRect();
    const isInside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;

    if (isInside) {
      if (!isMouseCurrentlyOverCanvas) {
        // Mouse re-entered, tool.onMouseMove will handle drawing and callback
        isMouseCurrentlyOverCanvas = true;
      }
    } else {
      if (isMouseCurrentlyOverCanvas) {
        // Mouse has left the canvas area
        isMouseCurrentlyOverCanvas = false;
        if (verticalLine) {
          verticalLine.remove();
          verticalLine = null;
        }
        onMouseMoveCallback({ mouseX: null, mouseY: null, canvasWidth: paper.view.bounds.width }); // Signal mouse has left, pass current canvas width
      }
    }
  };

  document.addEventListener("mousemove", handleDocumentMouseMove);

  const resizeHandler = () => {
    if (canvasElement && paper.view && paper.project) {
      // Update view size
      paper.view.viewSize = new paper.Size(canvasElement.clientWidth, canvasElement.clientHeight);

      // Clear the entire project to remove old drawings
      paper.project.clear();
      verticalLine = null; // The Path object for verticalLine was removed by clear(), so nullify our reference

      // Re-create interactive elements. createInteractiveElements uses paper.view.center, which is now updated.
      createInteractiveElements();
    }
  };

  resizeHandler(); // Call initially to set size and position elements correctly.

  const cleanupInputHandlers = () => {
    document.removeEventListener("mousemove", handleDocumentMouseMove);
    if (tool) {
      tool.remove();
    }
  };

  return { resizeHandler, cleanupInputHandlers };
};

export const clearPaperCanvas = (): void => {
  if (paper.project) {
    // Clears all items from the currently active paper.Project.
    // This removes all layers and their children.
    paper.project.clear();
  }
};
