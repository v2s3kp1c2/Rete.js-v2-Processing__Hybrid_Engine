import { createRoot } from "react-dom/client";
import { NodeEditor, GetSchemes, ClassicPreset } from "rete";
import { AreaPlugin, AreaExtensions } from "rete-area-plugin";
import { ConnectionPlugin } from "rete-connection-plugin";
import { ReactPlugin, Presets, ReactArea2D } from "rete-react-plugin";
import {
  AutoArrangePlugin,
  Presets as ArrangePresets
} from "rete-auto-arrange-plugin";
import { DataflowEngine, ControlFlowEngine } from "rete-engine";
import {
  ContextMenuExtra,
  ContextMenuPlugin,
  Presets as ContextMenuPresets
} from "rete-context-menu-plugin";

const socket = new ClassicPreset.Socket("socket");

class Start extends ClassicPreset.Node<{}, { exec: ClassicPreset.Socket }, {}> {
  width = 180;
  height = 90;

  constructor() {
    super("Start");
    this.addOutput("exec", new ClassicPreset.Output(socket, "Exec"));
  }

  execute(_: never, forward: (output: "exec") => void) {
    forward("exec");
  }

  data() {
    return {};
  }
}

class Log extends ClassicPreset.Node<
  { exec: ClassicPreset.Socket; message: ClassicPreset.Socket },
  { exec: ClassicPreset.Socket },
  {}
> {
  width = 180;
  height = 150;

  constructor(
    private log: (text: string) => void,
    private dataflow: DataflowEngine<Schemes>
  ) {
    super("Log");

    this.addInput("exec", new ClassicPreset.Input(socket, "Exec", true));
    this.addInput("message", new ClassicPreset.Input(socket, "Text"));
    this.addOutput("exec", new ClassicPreset.Output(socket, "Exec"));
  }

  async execute(input: "exec", forward: (output: "exec") => void) {
    const inputs = (await this.dataflow.fetchInputs(this.id)) as {
      message: string[];
    };

    this.log((inputs.message && inputs.message[0]) || "");

    forward("exec");
  }

  data() {
    return {};
  }
}

class TextNode extends ClassicPreset.Node<
  {},
  { value: ClassicPreset.Socket },
  { value: ClassicPreset.InputControl<"text"> }
> {
  height = 120;
  width = 180;

  constructor(initial: string) {
    super("Text");
    this.addControl(
      "value",
      new ClassicPreset.InputControl("text", { initial })
    );
    this.addOutput("value", new ClassicPreset.Output(socket, "Number"));
  }

  execute() {}

  data(): { value: string } {
    return {
      value: this.controls.value.value || ""
    };
  }
}

class Connection<
  A extends NodeProps,
  B extends NodeProps
> extends ClassicPreset.Connection<A, B> {
  isLoop?: boolean;
}

type NodeProps = Start | Log | TextNode;
type ConnProps = Connection<Start, Log> | Connection<TextNode, Log>;

type Schemes = GetSchemes<NodeProps, ConnProps>;

type AreaExtra = ReactArea2D<any> | ContextMenuExtra;

export async function createEditor(
  container: HTMLElement,
  log: (text: string) => void
) {
  const editor = new NodeEditor<Schemes>();
  const area = new AreaPlugin<Schemes, AreaExtra>(container);
  const connection = new ConnectionPlugin<Schemes, AreaExtra>();
  const render = new ReactPlugin<Schemes, AreaExtra>({ createRoot });
  const arrange = new AutoArrangePlugin<Schemes>();
  const dataflow = new DataflowEngine<Schemes>(({ inputs, outputs }) => {
    return {
      inputs: () => Object.keys(inputs).filter((name) => name !== "exec"),
      outputs: () => Object.keys(outputs).filter((name) => name !== "exec")
    };
  });
  const engine = new ControlFlowEngine<Schemes>(() => {
    return {
      inputs: () => ["exec"],
      outputs: () => ["exec"]
    };
  });
  const contextMenu = new ContextMenuPlugin<Schemes>({
    items: ContextMenuPresets.classic.setup([
      ["Start", () => new Start()],
      ["Log", () => new Log(log, dataflow)],
      ["Text", () => new TextNode("")]
    ])
  });
  area.use(contextMenu);

  arrange.addPreset(ArrangePresets.classic.setup());

  AreaExtensions.selectableNodes(area, AreaExtensions.selector(), {
    accumulating: AreaExtensions.accumulateOnCtrl()
  });

  render.addPreset(Presets.contextMenu.setup());
  render.addPreset(Presets.classic.setup());

  editor.use(engine);
  editor.use(dataflow);
  editor.use(area);
  area.use(connection);
  area.use(render);
  area.use(arrange);

  AreaExtensions.simpleNodesOrder(area);
  AreaExtensions.showInputControl(area);

  const start = new Start();
  const text1 = new TextNode("log");
  const log1 = new Log(log, dataflow);

  const con1 = new Connection(start, "exec", log1, "exec");
  const con2 = new Connection(text1, "value", log1, "message");

  await editor.addNode(start);
  await editor.addNode(text1);
  await editor.addNode(log1);

  await editor.addConnection(con1);
  await editor.addConnection(con2);

  setInterval(() => {
    dataflow.reset();
    engine.execute(start.id);
  }, 1000);

  await arrange.layout();
  AreaExtensions.zoomAt(area, editor.getNodes());

  return {
    destroy: () => area.destroy()
  };
}
