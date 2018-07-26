/**
 *
 * The **GraphicalEditor** is responsible for layout and dialog handling.
 *
 * @author Andreas Herz
 */
import ProbeWindow from "./ProbeWindow"
import ConnectionRouter from "./ConnectionRouter"
import DropInterceptorPolicy from "./DropInterceptorPolicy"
import EditEditPolicy from "./EditEditPolicy"
import Mousetrap from "mousetrap"
import ProbeFigure from "./figures/ProbeFigure"
import conf from "./Configuration"
import Connection from "./figures/Connection"
import SimulationEditPolicy from "./SimulationEditPolicy"
import MarkdownDialog from "./dialog/MarkdownDialog"
import CodeDialog from "./dialog/CodeDialog"

export default draw2d.Canvas.extend({

  init: function (id) {
    let _this = this

    this._super(id, 6000, 6000)

    this.probeWindow = new ProbeWindow(this)

    this.simulate = false
    this.animationFrameFunc = this._calculate.bind(this)

    this.timerBase = 10 // ms calculate every 10ms all elements

    this.setScrollArea("#draw2dCanvasWrapper")

    // register this class as event listener for the canvas
    // CommandStack. This is required to update the state of
    // the Undo/Redo Buttons.
    //
    this.getCommandStack().addEventListener(this)

    let router = new ConnectionRouter()
    router.abortRoutingOnFirstVertexNode = false
    let createConnection = function (sourcePort, targetPort) {
      let c = new Connection({
        color: "#000000",
        router: router,
        stroke: 1.5,
        radius: 2
      })
      if (sourcePort) {
        c.setSource(sourcePort)
        c.setTarget(targetPort)
      }
      return c
    }

    this.installEditPolicy(new DropInterceptorPolicy())

    // install a Connection create policy which matches to a "circuit like"
    // connections
    //
    this.connectionPolicy = new draw2d.policy.connection.ComposedConnectionCreatePolicy(
      [
        // create a connection via Drag&Drop of ports
        //
        new draw2d.policy.connection.DragConnectionCreatePolicy({
          createConnection: createConnection
        }),
        // or via click and point
        //
        new draw2d.policy.connection.OrthogonalConnectionCreatePolicy({
          createConnection: createConnection
        })
      ])
    this.installEditPolicy(this.connectionPolicy)

    // show the ports of the elements only if the mouse cursor is close to the shape.
    //
    this.coronaFeedback = new draw2d.policy.canvas.CoronaDecorationPolicy({diameterToBeVisible: 50})
    this.installEditPolicy(this.coronaFeedback)

    // nice grid decoration for the canvas paint area
    //
    this.grid = new draw2d.policy.canvas.ShowGridEditPolicy(20)
    this.installEditPolicy(this.grid)

    // add some SnapTo policy for better shape/figure alignment
    //
    this.installEditPolicy(new draw2d.policy.canvas.SnapToGeometryEditPolicy())
    this.installEditPolicy(new draw2d.policy.canvas.SnapToCenterEditPolicy())
    this.installEditPolicy(new draw2d.policy.canvas.SnapToInBetweenEditPolicy())

    this.installEditPolicy(new EditEditPolicy())

    // Enable Copy&Past for figures
    //
    Mousetrap.bind(['ctrl+c', 'command+c'], () => {
      let primarySelection = this.getSelection().getPrimary()
      if (primarySelection !== null) {
        this.clippboardFigure = primarySelection.clone({excludePorts: true})
        this.clippboardFigure.translate(5, 5)
      }
      return false
    })
    Mousetrap.bind(['ctrl+v', 'command+v'], () => {
      if (this.clippboardFigure !== null) {
        let cloneToAdd = this.clippboardFigure.clone({excludePorts: true})
        let command = new draw2d.command.CommandAdd(this, cloneToAdd, cloneToAdd.getPosition())
        this.getCommandStack().execute(command)
        this.setCurrentSelection(cloneToAdd)
      }
      return false
    })


    Mousetrap.bind(['left'], function (event) {
      let diff = _this.getZoom() < 0.5 ? 0.5 : 1
      _this.getSelection().each(function (i, f) {
        f.translate(-diff, 0)
      })
      return false
    })
    Mousetrap.bind(['up'], function (event) {
      let diff = _this.getZoom() < 0.5 ? 0.5 : 1
      _this.getSelection().each(function (i, f) {
        f.translate(0, -diff)
      })
      return false
    })
    Mousetrap.bind(['right'], function (event) {
      let diff = _this.getZoom() < 0.5 ? 0.5 : 1
      _this.getSelection().each(function (i, f) {
        f.translate(diff, 0)
      })
      return false
    })
    Mousetrap.bind(['down'], function (event) {
      let diff = _this.getZoom() < 0.5 ? 0.5 : 1
      _this.getSelection().each(function (i, f) {
        f.translate(0, diff)
      })
      return false
    })


    let setZoom = function (newZoom) {
      let bb = _this.getBoundingBox().getCenter()
      let c = $("#draw2dCanvasWrapper")
      _this.setZoom(newZoom)
      _this.scrollTo((bb.y / newZoom - c.height() / 2), (bb.x / newZoom - c.width() / 2))
    }

    //  ZoomIn Button and the callbacks
    //
    $("#canvas_zoom_in").on("click", function () {
      setZoom(_this.getZoom() * 1.2)
    })

    // OneToOne Button
    //
    $("#canvas_zoom_normal").on("click", function () {
      setZoom(1.0)
    })

    //ZoomOut Button and the callback
    //
    $("#canvas_zoom_out").on("click", function () {
      setZoom(_this.getZoom() * 0.8)
    })


    $(".toolbar").delegate("#editDelete:not(.disabled)", "click", function () {
      let selection = _this.getSelection()
      _this.getCommandStack().startTransaction(draw2d.Configuration.i18n.command.deleteShape)
      selection.each(function (index, figure) {

        // Don't delete the conection if the source or target node part of the
        // selection. In this case the nodes deletes all connections by itself.
        //
        if (figure instanceof draw2d.Connection) {
          if (selection.contains(figure.getSource().getRoot()) || selection.contains(figure.getTarget().getRoot())) {
            return
          }
        }

        let cmd = figure.createCommand(new draw2d.command.CommandType(draw2d.command.CommandType.DELETE))
        if (cmd !== null) {
          _this.getCommandStack().execute(cmd)
        }
      })
      // execute all single commands at once.
      _this.getCommandStack().commitTransaction()
    })


    $(".toolbar").delegate("#editUndo:not(.disabled)", "click", function () {
      _this.getCommandStack().undo()
    })

    $(".toolbar").delegate("#editRedo:not(.disabled)", "click", function () {
      _this.getCommandStack().redo()
    })

    $("#simulationStartStop").on("click", function () {
      _this.simulationToggle()
    })


    // Register a Selection listener for the state hnadling
    // of the Delete Button
    //
    this.on("select", function (emitter, event) {
      if (event.figure === null) {
        $("#editDelete").addClass("disabled")
      }
      else {
        $("#editDelete").removeClass("disabled")
      }
    })

    this.on("contextmenu", function (emitter, event) {
      let figure = _this.getBestFigure(event.x, event.y)

      // a connectionprovides its own context menu
      //
      if (figure instanceof draw2d.Connection) {
        return
      }
      if (figure instanceof ProbeFigure) {
        return
      }

      if (figure !== null) {
        let x = event.x
        let y = event.y

        let pathToMD = conf.shapes.url + figure.NAME + ".md"
        let pathToCustom = conf.shapes.url + figure.NAME + ".custom"
        let pathToDesign = conf.designer.url + "?timestamp=" + new Date().getTime() + "#file=" + figure.NAME + ".shape"
        let items = {
          "label": {name: "Attach Label", icon: "x ion-ios-pricetag-outline"},
          "delete": {name: "Delete", icon: "x ion-ios-close-outline"},
          "sep1": "---------",
          "design": {name: "Customize Shape", icon: "x ion-ios-compose-outline"},
          "code": {name: "Show Custom Code", icon: "x ion-code"},
          "help": {name: "About", icon: "x ion-ios-information-outline"}
        }

        $.contextMenu({
          selector: 'body',
          events:
            {
              hide: function () {
                $.contextMenu('destroy')
              }
            },
          callback: $.proxy(function (key, options) {
            switch (key) {
              case "code":
                $.get(pathToCustom, function (content) {
                  new CodeDialog().show(content)
                })
                break
              case "label":
                let text = prompt("Label")
                if (text) {
                  let label = new draw2d.shape.basic.Label({text: text, stroke: 0, x: -20, y: -40})
                  let locator = new draw2d.layout.locator.SmartDraggableLocator()
                  label.installEditor(new draw2d.ui.LabelInplaceEditor())
                  figure.add(label, locator)
                }
                break
              case "design":
                window.open(pathToDesign, "designer")
                break
              case "help":
                $.get(pathToMD, function (content) {
                  new MarkdownDialog().show(content)
                })
                break
               case "delete":
                let cmd = new draw2d.command.CommandDelete(figure)
                _this.getCommandStack().execute(cmd)
                break
              default:
                break
            }

          }, this),
          x: x,
          y: y,
          items: items

        })
      }
    })

    // hide the figure configuration dialog if the user clicks inside the canvas
    //
    this.on("click", function () {
      $("#figureConfigDialog").hide()
    })

    socket.on("shape:generated", msg => {
      $.getScript(conf.shapes.url + msg.jsPath + "?timestamp=" + new Date().getTime(),
        this.reloadFromCache.bind(this)
      )
    });

    this.slider = $('#simulationBaseTimer')
      .slider({
        id: "simulationBaseTimerSlider"
      })
      .on("slide", function (event) {
        // min = 50     => 100ms
        // norm= 100    => 10ms ticks
        // max = 500    =>  2ms ticks
        //
        // To map between the different intervals
        // [A, B] --> [a, b]
        // use this formula
        // (val - A)*(b-a)/(B-A) + a

        if (event.value < 100) {
          _this.timerBase = parseInt(100 - ((event.value - 50) * (100 - 10) / (100 - 50) + 10))
        }
        else {
          _this.timerBase = parseInt(11 - ((event.value - 100) * (10 - 2) / (500 - 100) + 2))
        }
      })

    // force focus for the searchbox in the object palette
    //
    /*
    setInterval(function(){
        // force only the focus if the editor tab pane is visible
        if(!$("#editor").hasClass("active")){
            return;
        }

        // fore only the focus if the "filter" input element the one and only visible
        // input field
        //
        if($("input:visible").length>1){
            return;
        }

        document.getElementById("filter").focus();
    },10);
    */


    socket.on('disconnect', function () {
      $(".raspiConnection").fadeIn()
    })

    socket.on('connect', function () {
      $(".raspiConnection").fadeOut()
    })
  },

  isSimulationRunning: function () {
    return this.simulate
  },

  /**
   * @method
   * Clear the canvas and stop the simulation. Be ready for the next clean circuit
   * load. Start from the beginning
   */
  clear: function () {
    this.simulationStop()

    this._super()

    this.centerDocument()
  },

  /**
   * Disable snapTo GRID if we have select more than one element
   * @param figure
   * @param pos
   */
  snapToHelper: function (figure, pos) {
    if (this.getSelection().getSize() > 1) {
      return pos
    }
    return this._super(figure, pos)
  },

  /**
   * @method
   * Called if the user drop the droppedDomNode onto the canvas.<br>
   * <br>
   * Draw2D use the jQuery draggable/droppable lib. Please inspect
   * http://jqueryui.com/demos/droppable/ for further information.
   *
   * @param {HTMLElement} droppedDomNode The dropped DOM element.
   * @param {Number} x the x coordinate of the drop
   * @param {Number} y the y coordinate of the drop
   * @param {Boolean} shiftKey true if the shift key has been pressed during this event
   * @param {Boolean} ctrlKey true if the ctrl key has been pressed during the event
   * @private
   **/
  onDrop: function (droppedDomNode, x, y, shiftKey, ctrlKey) {
    let type = $(droppedDomNode).data("shape")
    let figure = eval("new " + type + "();") // jshint ignore:line
    // create a command for the undo/redo support
    let command = new draw2d.command.CommandAdd(this, figure, x, y)
    this.getCommandStack().execute(command)
  },

  simulationToggle: function () {
    if (this.simulate === true) {
      this.simulationStop()
    } else {
      this.simulationStart()
    }
  },

  simulationStart: function () {
    if (this.simulate === true) {
      return // silently
    }

    this.simulate = true

    this.installEditPolicy(new SimulationEditPolicy())
    this.uninstallEditPolicy(this.connectionPolicy)
    this.uninstallEditPolicy(this.coronaFeedback)
    this.commonPorts.each(function (i, p) {
      p.setVisible(false)
    })

    this._calculate()

    $("#simulationStartStop").addClass("pause")
    $("#simulationStartStop").removeClass("play")
    $(".simulationBase").fadeIn("slow")
    $("#paletteElementsOverlay").fadeIn("fast")
    $("#paletteElementsOverlay").height($("#paletteElements").height())
    this.slider.slider("setValue", 100)

    this.probeWindow.show()
  },

  simulationStop: function () {
    this.simulate = false
    this.commonPorts.each(function (i, p) {
      p.setVisible(true)
    })
    this.installEditPolicy(new EditEditPolicy())
    this.installEditPolicy(this.connectionPolicy)
    this.installEditPolicy(this.coronaFeedback)

    $("#simulationStartStop").addClass("play")
    $("#simulationStartStop").removeClass("pause")
    $(".simulationBase").fadeOut("slow")
    $("#paletteElementsOverlay").fadeOut("fast")
    this.probeWindow.hide()
  },

  _calculate: function () {
    // call the "calculate" method if given to calculate the output-port values
    //
    this.getFigures().each(function (i, figure) {
      figure.calculate()
    })

    // transport the value from oututPort to inputPort
    //
    this.getLines().each(function (i, line) {
      let outPort = line.getSource()
      let inPort = line.getTarget()
      inPort.setValue(outPort.getValue())
      line.setColor(outPort.getValue() ? conf.color.high : conf.color.low)
    })

    if (this.simulate === true) {
      //     setImmediate(this.animationFrameFunc);
      setTimeout(this.animationFrameFunc, this.timerBase)
    }

    this.probeWindow.tick(this.timerBase)
  },

  /**
   * @method
   * Sent when an event occurs on the command stack. draw2d.command.CommandStackEvent.getDetail()
   * can be used to identify the type of event which has occurred.
   *
   * @template
   *
   * @param {draw2d.command.CommandStackEvent} event
   **/
  stackChanged: function (event) {
    $("#editUndo").addClass("disabled")
    $("#editRedo").addClass("disabled")

    if (event.getStack().canUndo()) {
      $("#editUndo").removeClass("disabled")
    }

    if (event.getStack().canRedo()) {
      $("#editRedo").removeClass("disabled")
    }

  },

  getBoundingBox: function () {
    let xCoords = []
    let yCoords = []
    this.getFigures().each(function (i, f) {
      let b = f.getBoundingBox()
      xCoords.push(b.x, b.x + b.w)
      yCoords.push(b.y, b.y + b.h)
    })
    let minX = Math.min.apply(Math, xCoords)
    let minY = Math.min.apply(Math, yCoords)
    let width = Math.max(100, Math.max.apply(Math, xCoords) - minX)
    let height = Math.max(100, Math.max.apply(Math, yCoords) - minY)

    return new draw2d.geo.Rectangle(minX, minY, width, height)
  },

  reloadFromCache: function () {
    new draw2d.io.json.Writer().marshal(this, json => {
      //this.clear();
      draw2d.Canvas.prototype.clear.call(this)

      new draw2d.io.json.Reader().unmarshal(this, json)
    })
  },

  centerDocument: function () {
    let c = $("#draw2dCanvasWrapper")
    if (this.getFigures().getSize() > 0) {
      // get the bounding box of the document and translate the complete document
      // into the center of the canvas. Scroll to the top left corner after them
      //
      let bb = this.getBoundingBox()
      this.scrollTo(bb.y - c.height() / 2, bb.x - c.width() / 2)
    }
    else {
      let bb = {
        x: this.getWidth() / 2,
        y: this.getHeight() / 2
      }
      this.scrollTo(bb.y - c.height() / 2, bb.x - c.width() / 2)
    }
  },

  /**
   * @method
   * Transforms a document coordinate to canvas coordinate.
   *
   * @param {Number} x the x coordinate relative to the window
   * @param {Number} y the y coordinate relative to the window
   *
   * @returns {draw2d.geo.Point} The coordinate in relation to the canvas [0,0] position
   */
  fromDocumentToCanvasCoordinate: function (x, y) {
    return new draw2d.geo.Point(
      (x - this.getAbsoluteX()) * this.zoomFactor,
      (y - this.getAbsoluteY()) * this.zoomFactor)
  },

  /**
   * @method
   * Transforms a canvas coordinate to document coordinate.
   *
   * @param {Number} x the x coordinate in the canvas
   * @param {Number} y the y coordinate in the canvas
   *
   * @returns {draw2d.geo.Point} the coordinate in relation to the document [0,0] position
   */
  fromCanvasToDocumentCoordinate: function (x, y) {
    return new draw2d.geo.Point(
      ((x * (1 / this.zoomFactor)) + this.getAbsoluteX()),
      ((y * (1 / this.zoomFactor)) + this.getAbsoluteY()))
  }
})