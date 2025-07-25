import paper from "paper";

interface InitializePaperCanvasParams {
  canvasElement: HTMLCanvasElement;
  canvasWidth?: number;
  canvasHeight?: number;
}

interface InitializePaperCanvasReturn {
  drawPaperItems: () => void;
  cleanupInputHandlers: () => void;
}

export const initializePaperCanvas = ({
  canvasElement,
  canvasWidth = 800,
  canvasHeight = 400,
}: InitializePaperCanvasParams): InitializePaperCanvasReturn => {
  // Create an isolated Paper.js project for this canvas to avoid conflicts with timelineYears
  const project = new paper.Project(canvasElement);

  // Use the project's view and create groups within this project
  const uiGroup = new paper.Group();
  project.activeLayer.addChild(uiGroup);

  // Initialize tool for potential future interaction handling
  let tool: paper.Tool | null = null;

  // Activate this project to ensure tools work with it
  project.activate();
  tool = new paper.Tool();
  tool.activate();

  const drawPaperItems = () => {
    if (canvasElement && project.view && project) {
      try {
        // Activate this project before making changes
        project.activate();

        const displayWidth = canvasWidth;
        const displayHeight = canvasHeight;

        // Set canvas dimensions to match display size
        canvasElement.width = displayWidth;
        canvasElement.height = displayHeight;
        canvasElement.style.width = `${displayWidth}px`;
        canvasElement.style.height = `${displayHeight}px`;

        // Set Paper.js view size to match canvas dimensions
        project.view.viewSize = new paper.Size(displayWidth, displayHeight);

        // Clear existing content
        uiGroup.removeChildren();

        // Debug: Add a background rectangle to verify canvas is working
        const background = new paper.Rectangle(0, 0, displayWidth, displayHeight);
        const backgroundRect = new paper.Path.Rectangle(background);
        backgroundRect.fillColor = new paper.Color(0.9, 0.9, 0.9); // Light gray background
        uiGroup.addChild(backgroundRect);

        // Create "Hello World" text in the center of the canvas
        // Note: PointText uses the baseline for positioning, so we need to adjust for center alignment
        const textY = displayHeight / 2 + 6; // Offset by approximate font size / 2 for visual centering
        const helloText = new paper.PointText({
          point: new paper.Point(displayWidth / 2, textY),
          content: "Hello World",
          fillColor: new paper.Color(1, 0, 0), // Red color for better visibility
          fontSize: 20,
          fontFamily: "Arial, sans-serif",
          justification: "center",
        });

        uiGroup.addChild(helloText);

        // Update the view
        project.view.update();
      } catch (error) {
        console.error("Error in timelineDay drawPaperItems:", error);
      }
    }
  };

  // Initial draw
  drawPaperItems();

  const cleanupInputHandlers = () => {
    // Clean up tool
    if (tool) {
      tool.remove();
      tool = null;
    }
    // Remove the project when cleaning up to prevent memory leaks
    if (project) {
      project.remove();
    }
  };

  return { drawPaperItems, cleanupInputHandlers };
};
