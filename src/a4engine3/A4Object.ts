class A4Object {

    constructor(name:string, sort:Sort)
    {
        this.ID = "" + A4Object.s_nextID++;
        this.name = name;
        this.sort = sort;
        this.animations = new Array(A4_N_ANIMATIONS);
        for(let i:number = 0;i<A4_N_ANIMATIONS;i++) this.animations[i] = null;
    }


    loadObjectAdditionalContent(xml:Element, game:A4Game, of:A4ObjectFactory, objectsToRevisit_xml:Element[], objsctsToRevisit_object:A4Object[])
    {
        // add animations:
        var animations_xml:Element[] = getElementChildrenByTag(xml, "animation");
        for(let i:number = 0;i<animations_xml.length;i++) {
            var animation_xml:Element = animations_xml[i];
            var a:A4Animation = A4Animation.fromXML(animation_xml, game);
            
            for(let idx:number = 0;idx<A4_N_ANIMATIONS;idx++) {
                if (animationNames[idx] == animation_xml.getAttribute("name")) {
                    this.setAnimation(idx, a);
                    a = null;
                    break;
                }
            }
            if (a != null) console.error("A4ObjectFactory: not supported animation " + animation_xml.getAttribute("name"));
        }
            
        // set attributes (we allow them to be either "attribute" tags, or the "property" tags set by TILED)::
        var canWalkSet:boolean = false;
        var canSwimSet:boolean = false;
        var attributes_xml:Element[] = getElementChildrenByTag(xml, "attribute");
        for(let i:number = 0;i<attributes_xml.length;i++) {
            var attribute_xml:Element = attributes_xml[i];
            var a_name:string = attribute_xml.getAttribute("name");
            
            if (a_name == "canSwim") {
                canSwimSet = true;
                this.canSwim = false;
                if (attribute_xml.getAttribute("value") == "true") this.canSwim = true;
            } else if (a_name == "canWalk") {
                canWalkSet = true;
                this.canWalk = false;
                if (attribute_xml.getAttribute("value") == "true") this.canWalk = true;
            } else if (!this.loadObjectAttribute(attribute_xml)) {
                console.error("Unknown attribute: " + a_name + " for object " + xml.getAttribute("class"));
            }
        }
        var properties_l_xml:Element = getFirstElementChildrenByTag(xml, "properties");
        if (properties_l_xml != null) {
            var properties_xml:Element[] = getElementChildrenByTag(properties_l_xml, "property");
            for(let i:number = 0;i<properties_xml.length;i++) {
                var attribute_xml:Element = properties_xml[i];
                var a_name:string = attribute_xml.getAttribute("name");
                
                if (a_name == "canSwim") {
                    canSwimSet = true;
                    this.canSwim = false;
                    if (attribute_xml.getAttribute("value") == "true") this.canSwim = true;
                } else if (a_name == "canWalk") {
                    canWalkSet = true;
                    this.canWalk = false;
                    if (attribute_xml.getAttribute("value") == "true") this.canWalk = true;
                } else if (!this.loadObjectAttribute(attribute_xml)) {
                    console.error("Unknown attribute: " + a_name + " for object " + xml.getAttribute("class"));
                }
            }
        }
        if (canWalkSet) {
            if (!canSwimSet) this.canSwim = !this.canWalk;
        } else {
            if (canSwimSet) this.canWalk = !this.canSwim;
        }
            
        // loading scripts:
        {
            // on start:
            var onstarts_xml:Element[] = getElementChildrenByTag(xml, "onStart");
            for(let i:number = 0;i<onstarts_xml.length;i++) {
                var onstart_xml:Element = onstarts_xml[i];
                var tmpq:A4ScriptExecutionQueue = null;
//                var onstart_xml_l:NodeListOf<Element> = onstart_xml.children;
                var onstart_xml_l:HTMLCollection = onstart_xml.children;
                for(let j:number = 0;j<onstart_xml_l.length;j++) {
                    var script_xml:Element = onstart_xml_l[j];
                    var s:A4Script = A4Script.fromXML(script_xml);
                    if (tmpq==null) tmpq = new A4ScriptExecutionQueue(this, null, null, null);
                    tmpq.scripts.push(s);
                }
                if (tmpq!=null) this.scriptQueues.push(tmpq);
            }
            
            // on end:
            var onends_xml:Element[] = getElementChildrenByTag(xml, "onEnd");
            for(let i:number = 0;i<onends_xml.length;i++) {
                var onend_xml:Element = onends_xml[i];
//                var script_xml_l:NodeListOf<Element> = onend_xml.children;
                var script_xml_l:HTMLCollection = onend_xml.children;
                for(let j:number = 0;j<script_xml_l.length;j++) {
                    var script_xml:Element = script_xml_l[j];
                    if (this.eventScripts[A4_EVENT_END] == null) this.eventScripts[A4_EVENT_END] = [];
                    this.eventScripts[A4_EVENT_END].push(new A4EventRule(A4_EVENT_END, s, false, 0, 0));
                }
            }
                    
            // event rules:
            var eventrules_xml:Element[] = getElementChildrenByTag(xml, "eventRule");
            for(let i:number = 0;i<eventrules_xml.length;i++) {
                var rule_xml:Element = eventrules_xml[i];
                var r:A4EventRule = A4EventRule.fromXML(rule_xml);
                if (this.eventScripts[r.event] == null) this.eventScripts[r.event] = [];
                this.eventScripts[r.event].push(r);
            }
        }

        // perception properties:
        this.perceptionProperties = [];
        for(let prop_xml of getElementChildrenByTag(xml, "perceptionProperty")) {
            this.perceptionProperties.push(prop_xml.getAttribute("value"));
        }
    }


    loadObjectAttribute(attribute_xml:Element) : boolean
    {
        var name:string = attribute_xml.getAttribute("name");
        
        /*
        if (name == "ID") {
            this.ID = attribute_xml.getAttribute("value");
            if (A4Object.s_nextID <= Number(this.ID)) A4Object.s_nextID = Number(this.ID)+1;
            return true;
        } else */
        if (name == "name") {
            this.name = attribute_xml.getAttribute("value");
            return true;
        } else if (name == "gold" ||
                   name == "value") {
            this.gold = Number(attribute_xml.getAttribute("value"));
            return true;
        } else if (name == "takeable") {
            this.takeable = false;
            if (attribute_xml.getAttribute("value") == "true") this.takeable = true;
            return true;
        } else if (name == "usable" ||
                   name == "useable") {
            this.usable = false;
            if (attribute_xml.getAttribute("value") == "true") this.usable = true;
            return true;
        } else if (name == "interacteable") {
            this.interacteable = false;
            if (attribute_xml.getAttribute("value") == "true") this.interacteable = true;
            return true;
        } else if (name == "burrowed") {
            this.burrowed = false;
            if (attribute_xml.getAttribute("value") == "true") this.burrowed = true;
            return true;
        } else if (name == "direction") {
            this.direction = Number(attribute_xml.getAttribute("value"));
            this.currentAnimation = A4_ANIMATION_IDLE_LEFT + this.direction;
//            console.log(this.name + ".direction = " + this.direction);
            return true;
        } else if (name == "tallness") {
            this.tallness = Number(attribute_xml.getAttribute("value"));
            return true;
        }
        return false;        
    }


    revisitObject(xml:Element, game:A4Game)
    {
    }


    pushScripttoExecute(script:A4Script, map:A4Map, game:A4Game, otherCharacter:A4Character)
    {
        var sq:A4ScriptExecutionQueue = new A4ScriptExecutionQueue(this, map, game, otherCharacter);
        sq.scripts.push(script);
        this.addScriptQueue(sq);        
    }


    saveToXML(game:A4Game, type:number, saveLocation:boolean) : string
    {
        var xmlString:string = "<object id=\"" + this.ID + "\"";

        if (type==0) {
            xmlString +=" type=\""+this.sort.name + "\"";
            xmlString +=" completeRedefinition=\"true\"";
        } else if (type==1) {
            xmlString +=" name=\""+this.name+"\"";
            xmlString +=" type=\"Bridge\"";
        } else if (type==2) {
            xmlString +=" name=\""+this.name+"\"";
            xmlString +=" type=\"BridgeDestination\"";
        }

        if (saveLocation) {
            xmlString +=" x=\""+this.x+"\"";
            xmlString +=" y=\""+this.y+"\"";
            xmlString +=" width=\""+this.getPixelWidth()+"\"";
            xmlString +=" height=\""+this.getPixelHeight()+"\"";
        }

        xmlString +=">\n";
        
        xmlString += this.savePropertiesToXML(game) + "\n";

        for(let prop of this.perceptionProperties) {
            xmlString += "<perceptionProperty value=\"" + prop + "\"/>\n";
        }

        xmlString += "</object>";  
        return xmlString;
    }

  
    saveToXMLForMainFile(game:A4Game, tag:string, mapNumber:number) : string
    {
        var xmlString:string = "";
        xmlString += "<" + tag + " id=\"" + this.ID + "\"" + 
                                 " type=\""+ this.sort.name +"\"" +
                                 " completeRedefinition=\"true\"" +
                                 " x=\""+ this.x +"\"" +
                                 " y=\""+ this.y +"\"" +
                                 " map=\""+ mapNumber +"\">\n";

        xmlString += this.savePropertiesToXML(game) + "\n";

        xmlString += "</" + tag + ">";
        return xmlString;
    }

    
    savePropertiesToXML(game:A4Game) : string
    {
        var xmlString:string = "";
        
        for(let i:number = 0;i<A4_N_ANIMATIONS;i++) {
            if (this.animations[i]!=null) {
                xmlString += this.animations[i].saveToXML(animationNames[i]) + "\n";
            }
        }

        if (this.name!=null) xmlString += this.saveObjectAttributeToXML("name",this.name) + "\n";
        if (this.gold>0) xmlString += this.saveObjectAttributeToXML("gold",this.gold) + "\n";
        
        if (this.isCharacter() || this.isVehicle()) {
            xmlString += this.saveObjectAttributeToXML("canWalk",this.canWalk) + "\n";
            xmlString += this.saveObjectAttributeToXML("canSwim",this.canSwim) + "\n";
        }
        xmlString += this.saveObjectAttributeToXML("takeable",this.takeable) + "\n";
        xmlString += this.saveObjectAttributeToXML("usable",this.usable) + "\n";
        xmlString += this.saveObjectAttributeToXML("interacteable",this.interacteable) + "\n";
        xmlString += this.saveObjectAttributeToXML("burrowed",this.burrowed) + "\n";
        xmlString += this.saveObjectAttributeToXML("direction",this.direction) + "\n";
        xmlString += this.saveObjectAttributeToXML("tallness",this.tallness) + "\n";

        var onStarttagOpen:boolean = false;
        for(let v in this.storyState) {
            if (!onStarttagOpen) {
                xmlString += "<onStart>\n";
                onStarttagOpen = true;
            }
            xmlString+="<storyState variable=\""+v+"\"" + 
                                  " value=\""+this.storyState[v]+"\"" +
                                  " scope=\"object\"/>\n";
        }
        if (onStarttagOpen) xmlString += "</onStart>\n";

        // each execution queue goes to its own "onStart" block:
        for(let seq of this.scriptQueues) {
            xmlString += "<onStart>\n";
            for(let s of seq.scripts) xmlString += s.saveToXML() + "\n";
            xmlString += "</onStart>\n";
        }
        if (this.deadRequest) {
            xmlString += "<onStart>\n";
            xmlString += "<die/>\n";
            xmlString += "</onStart>\n";
        }
        
        if (this.agendas.length>0) {
            xmlString += "<onStart>\n";
            // create a script for the agenda
            for(let a of this.agendas) {
                xmlString += "<addAgenda agenda=\""+a.name+"\"" +
                                       " duration=\""+a.duration+"\"" +
                                       " loop=\""+a.loop+"\"" +
                                       " cycle=\""+a.cycle+"\">\n";
                for(let ae of a.entries) {
                    xmlString += "<entry time=\""+ae.time+"\">\n";
                    for(let s of ae.scripts) {
                        xmlString += s.saveToXML() + "\n";
                    }
                    xmlString += "</entry>\n";
                }
                xmlString += "</addAgenda>\n";
            }
            xmlString += "</onStart>\n";
        }

        // rules:
        for(let i:number = 0;i<A4_NEVENTS;i++) {
            if (this.eventScripts[i]!=null) {
                for(let er of this.eventScripts[i]) {
                    xmlString += er.saveToXML() + "\n";
                }
            }
        }        
        
        return xmlString;
    }


    saveObjectAttributeToXML(property:string, value:any) : string
    {
        return "<attribute name=\""+property+"\" value=\""+value+"\"/>";
    }


    update(game:A4Game) : boolean
    {
        this.executeScriptQueues(game);    // this has to be done first, since "onStart" is put here
        if (this.cycle==0) this.event(A4_EVENT_START, null, this.map, game);

        if (this.eventScripts[A4_EVENT_TIMER]!=null) {
            for(let r of this.eventScripts[A4_EVENT_TIMER]) r.execute(this,this.map,game,null);
        }
        if (this.eventScripts[A4_EVENT_STORYSTATE]!=null) {
            for(let r of this.eventScripts[A4_EVENT_STORYSTATE]) r.execute(this,this.map,game,null);
        }
        var toDelete:Agenda[] = [];
        for(let a of this.agendas) {
            if (a.execute(this,this.map,game,null)) toDelete.push(a);
        }
        for(let a of toDelete) {
            var idx:number = this.agendas.indexOf(a);
            this.agendas.splice(idx, 1);
        }
        
        if (this.map != null) {
            // only for those items actually on a map (and not inside of others)
            // change to the proper animation given the current direction:
            if (this.currentAnimation == A4_ANIMATION_IDLE && this.direction != A4_DIRECTION_NONE) {
                this.currentAnimation = this.direction+1;
            }

            if (this.animations[this.currentAnimation]!=null) {
                if (!this.animations[this.currentAnimation].update()) {
                    if (this.previousSeeThrough != this.animations[this.currentAnimation].seeThrough()) {
                        //console.log("object " + this.name + " changed seeThrough from " + this.previousSeeThrough + " to " + !this.previousSeeThrough);
                        this.map.reevaluateVisibilityRequest();
                        this.previousSeeThrough = !this.previousSeeThrough;
                    }
                }
            }
        }

        if (this.deadRequest) return false;

        this.cycle++;
        return true;
    }


    draw(offsetx:number, offsety:number, game:A4Game)
    {
        if (this.currentAnimation>=0 && this.animations[this.currentAnimation]!=null) {
            this.animations[this.currentAnimation].draw((this.x + offsetx), (this.y + offsety));
        }
    }


    drawDark(offsetx:number, offsety:number, game:A4Game)
    {
        if (this.currentAnimation>=0 && this.animations[this.currentAnimation]!=null) {
            this.animations[this.currentAnimation].drawDark((this.x + offsetx), (this.y + offsety));
        }
    }


    // this executes all the A4EventRules with the given event:
    event(event:number, otherCharacter:A4Character, map:A4Map, game:A4Game)
    {
        if (this.eventScripts[event] == null) return;
        for(let rule of this.eventScripts[event]) {
            rule.executeEffects(this, map, game, otherCharacter);
        }
    }


    eventWithID(event:number, ID:string, otherCharacter:A4Character, map:A4Map, game:A4Game)
    {

    }
 

    eventWithObject(event:number, otherCharacter:A4Character, object:A4Object, map:A4Map, game:A4Game)
    {
        if (this.eventScripts[event] == null) return;
        for(let rule of this.eventScripts[event]) {
            if (event==A4_EVENT_RECEIVE ||
                event==A4_EVENT_ACTION_TAKE ||
                event==A4_EVENT_ACTION_DROP ||
                event==A4_EVENT_ACTION_USE ||
                event==A4_EVENT_ACTION_INTERACT ||
                event==A4_EVENT_ACTION_CHOP ||
                event==A4_EVENT_ACTION_GIVE ||
                event==A4_EVENT_ACTION_SELL ||
                event==A4_EVENT_ACTION_BUY) {
                if (rule.item == null ||
                    object.name == rule.item ||
                    object.is_a_string(rule.item)) {
                    rule.executeEffects(this, map, game, otherCharacter);
                }
            } else {
                console.error("eventWithObject for event "+event+", is undefined\n");
            }
        }
    }


    eventWithInteger(event:number, value:number, otherCharacter:A4Character, map:A4Map, game:A4Game)
    {
        if (this.eventScripts[event] == null) return;
        for(let rule of this.eventScripts[event]) {
            console.error("eventWithInteger for event "+event+", is undefined");
        }
    }


    executeScriptQueues(game:A4Game)
    {
        var toDelete:A4ScriptExecutionQueue[] = [];
        for(let seb of this.scriptQueues) {
            while(true) {
                var s:A4Script = seb.scripts[0];
                var retval:number = s.execute((seb.object == null ? this:seb.object),
                                              (seb.map == null ? this.map:seb.map),
                                              (seb.game == null ? game:seb.game),
                                              seb.otherCharacter);
                if (retval==SCRIPT_FINISHED) {
                    seb.scripts.splice(0,1);
                    if (seb.scripts.length == 0) {
                        toDelete.push(seb);
                        break;
                    }
                } else if (retval==SCRIPT_NOT_FINISHED) {
                    break;
                } else if (retval==SCRIPT_FAILED) {
                    toDelete.push(seb);
                    break;
                }
            }
        }
        for(let seb of toDelete) {
            var idx:number = this.scriptQueues.indexOf(seb);
            this.scriptQueues.splice(idx, 1);
        }
    }


    addScriptQueue(seq: A4ScriptExecutionQueue) {
        this.scriptQueues.push(seq);
    }


    addEventRule(event:number, r:A4EventRule) 
    {
        if (this.eventScripts[event]==null) this.eventScripts[event] = [];
        this.eventScripts[event].push(r);
    }


    setStoryStateVariable(variable:string, value:string, game:A4Game)
    {
//        console.log("A4Object.setStoryStateVariable ("+this.ID+"): " + variable + " = " + value + " (at time " + game.cycle + ")");
        this.storyState[variable] = value;
        this.lastTimeStoryStateChanged = game.cycle;
    }


    getStoryStateVariable(variable:string) : string
    {
        return this.storyState[variable];
    }
    

    warp(x:number, y:number, map:A4Map)//, layer:number)
    {
        if (this.map!=null) this.map.removeObject(this);
        this.x = x;
        this.y = y;
        this.map = map;
        if (this.map!=null) this.map.addObject(this);
    }
    

    getPixelWidth():number
    {
        if (this.pixel_width_cache_cycle == this.cycle) return this.pixel_width_cache;
        if (this.currentAnimation<0) return 0;
        var a:A4Animation = this.animations[this.currentAnimation];
        if (a==null) return 0;
        this.pixel_width_cache = a.getPixelWidth();
        this.pixel_height_cache = a.getPixelHeight();
        this.pixel_width_cache_cycle = this.cycle;
        return this.pixel_width_cache;
    }


    getPixelHeight():number
    {
        if (this.pixel_width_cache_cycle == this.cycle) return this.pixel_height_cache;
        if (this.currentAnimation<0) return 0;
        var a:A4Animation = this.animations[this.currentAnimation];
        if (a==null) return 0;
        this.pixel_width_cache = a.getPixelWidth();
        this.pixel_height_cache = a.getPixelHeight();
        this.pixel_width_cache_cycle = this.cycle;
        return this.pixel_height_cache;
    }


    setAnimation(idx:number, a:A4Animation)
    {
        this.animations[idx] = a;
    }
    

    getAnimation(idx:number) : A4Animation
    {
        return this.animations[idx];
    }


    getCurrentAnimation() : A4Animation
    {
        return this.animations[this.currentAnimation];
    }

    
    die() {
        this.deadRequest = true;
    }


    isWalkable():boolean {return true;}
    isHeavy():boolean {return false;}      // this is used by pressure plates
    isPlayer():boolean {return false;}
//    isInteracteable():boolean {return false;}
    isKey():boolean {return false;}
    isCharacter():boolean {return false;}
    isDoor():boolean {return false;}
    isVehicle():boolean {return false;}
    isAICharacter():boolean {return false;}
    isTrigger():boolean {return false;}
    isPushable():boolean {return false;}
    
    respawns():boolean {return false;}
  

    seeThrough() : boolean
    {
        var a:A4Animation = this.animations[this.currentAnimation];
        if (a==null) return true;
        return a.seeThrough();
    }


    collision(x2:number, y2:number, dx2:number, dy2:number):boolean
    {
        var dx:number = this.getPixelWidth();
        var dy:number = this.getPixelHeight()-this.tallness;
        if (this.x+dx > x2 && x2+dx2 > this.x &&
            (this.y+this.tallness)+dy > y2 && y2+dy2 > (this.y+this.tallness)) return true;
        return false;        
    }


    collisionObject(o2:A4Object):boolean
    {
        var dx:number = this.getPixelWidth();
        var dy:number = this.getPixelHeight()-this.tallness;
        var dx2:number = o2.getPixelWidth();
        var dy2:number = o2.getPixelHeight()-o2.tallness;
        if (this.x+dx > o2.x && o2.x+dx2 > this.x &&
            (this.y+this.tallness)+dy > (o2.y+o2.tallness) && (o2.y+o2.tallness)+dy2 > (this.y+this.tallness)) return true;
        return false;
    }


    collisionObjectOffset(xoffs:number, yoffs:number, o2:A4Object):boolean
    {
        var dx:number = this.getPixelWidth();
        var dy:number = this.getPixelHeight()-this.tallness;
        var dx2:number = o2.getPixelWidth();
        var dy2:number = o2.getPixelHeight()-o2.tallness;
        if (this.x+xoffs+dx > o2.x && o2.x+dx2 > this.x+xoffs &&
            (this.y+this.tallness)+yoffs+dy > (o2.y+o2.tallness) && (o2.y+o2.tallness)+dy2 > (this.y+this.tallness)+yoffs) return true;
        return false;
    }


    canMove(direction:number, treatBridgesAsWalls:boolean) : boolean
    {
        if (treatBridgesAsWalls) {
            if (this.canMoveWithoutGoingThroughABridge(direction)) return true;
            return false;
        }
        if (this.map.walkableConsideringVehicles(this.x+direction_x_inc[direction]*this.map.tileWidth,
                                                 this.y+this.tallness+direction_y_inc[direction]*this.map.tileHeight,
                                                 this.getPixelWidth(),
                                                 this.getPixelHeight()-this.tallness,this)) return true;
        return false;
    }


    canMoveIgnoringObject(direction:number, treatBridgesAsWalls:boolean, toIgnore:A4Object) : boolean
    {
        if (treatBridgesAsWalls) {
            if (this.canMoveWithoutGoingThroughABridgeIgnoringObject(direction, toIgnore)) return true;
            return false;
        }
        if (this.map.walkableIgnoringObject(this.x+direction_x_inc[direction]*this.map.tileWidth,
                                            this.y+this.tallness+direction_y_inc[direction]*this.map.tileHeight,
                                            this.getPixelWidth(),
                                            this.getPixelHeight()-this.tallness,
                                            this, toIgnore)) return true;
        return false;
    }


    canMoveWithoutGoingThroughABridge(direction:number) : boolean
    {
        if (this.map.getBridge(Math.floor(this.x+direction_x_inc[direction]*this.map.tileWidth + this.getPixelWidth()/2),
                               Math.floor(this.y+this.tallness+direction_y_inc[direction]*this.map.tileHeight + (this.getPixelHeight()-this.tallness)/2))!=null) return false;
        if (this.map.walkableConsideringVehicles(this.x+direction_x_inc[direction]*this.map.tileWidth,
                                                 this.y+this.tallness+direction_y_inc[direction]*this.map.tileHeight,
                                                 this.getPixelWidth(),
                                                 this.getPixelHeight()-this.tallness,this)) return true;
        return false;
    }


    canMoveWithoutGoingThroughABridgeIgnoringObject(direction:number, toIgnore:A4Object) : boolean
    {
        if (this.map.getBridge(Math.floor(this.x+direction_x_inc[direction]*this.map.tileWidth + this.getPixelWidth()/2),
                               Math.floor(this.y+this.tallness+direction_y_inc[direction]*this.map.tileHeight + (this.getPixelHeight()-this.tallness)/2))!=null) return false;
        if (this.map.walkableIgnoringObject(this.x+direction_x_inc[direction]*this.map.tileWidth,
                                                 this.y+this.tallness+direction_y_inc[direction]*this.map.tileHeight,
                                                 this.getPixelWidth(),
                                                 this.getPixelHeight()-this.tallness,
                                                 this, toIgnore)) return true;
        return false;
    }


    pixelDistance(o2:A4Object) : number
    {
        var dx:number = 0;
        if (this.x > o2.x+o2.getPixelWidth()) {
            dx = this.x - (o2.x+o2.getPixelWidth());
        } else if (o2.x > this.x+this.getPixelWidth()) {
            dx = o2.x - (this.x+this.getPixelWidth());
        }
        var dy:number = 0;
        if (this.y + this.tallness > o2.y+o2.getPixelHeight()) {
            dy = this.y + this.tallness - (o2.y+o2.getPixelHeight());
        } else if (o2.y + o2.tallness > this.y+this.getPixelHeight()) {
            dy = o2.y + o2.tallness - (this.y+this.getPixelHeight());
        }
        return dx+dy;
    }


    addAgenda(a:Agenda)
    {
        this.removeAgenda(a.name);
        this.agendas.push(a);
    }


    removeAgenda(agenda:string)
    {
        for(let a2 of this.agendas) {
            if (a2.name == agenda) {
                var idx:number = this.agendas.indexOf(a2);
                this.agendas.splice(idx,1);
                return;
            }
        }
    }

    
    objectRemoved(o:A4Object)
    {
    }


    findObjectByName(name:string) : A4Object[]
    {
        return null;
    }


    findObjectByID(ID:string) : A4Object[]
    {
        return null;
    }


    // sorts:
    is_a(s:Sort) : boolean
    {
        return this.sort.is_a(s);
    }


    is_a_string(s:string) : boolean
    {
        return this.sort.is_a_string(s);
    }


    static s_nextID:number = 10000;    // start with a high-enough number so that there is no collisions with the maps
    ID:string;

    name:string;
    sort:Sort;
    x:number;
    y:number;
    //layer:number;
    map:A4Map = null;
    animations:A4Animation[] = null;
    currentAnimation:number = A4_ANIMATION_IDLE;
    previousSeeThrough:boolean = null;
    cycle:number = 0;
    
    deadRequest:boolean = false; // this is set to true, when the script "die" is executed

    // pixel width/height cache:
    pixel_width_cache_cycle:number = -1;
    pixel_width_cache:number = 0;
    pixel_height_cache:number = 0;
    
    // attributes:
    gold:number = 0;
    takeable:boolean = false;
    usable:boolean = false;
    interacteable:boolean = false;
    burrowed:boolean = false;
    canSwim:boolean = false;
    canWalk:boolean = true;

    direction:number = A4_DIRECTION_NONE;

    tallness:number = 0;

    // scripts:
    eventScripts:A4EventRule[][] = new Array(A4_NEVENTS);

    // script excution queues (these contain scripts that are pending execution, will be executed in the next "cycle"):
    scriptQueues: A4ScriptExecutionQueue[] = [];

    // story state:
    storyState:{ [id: string] : string; } = {};
    lastTimeStoryStateChanged:number = 0;
    
    // agendas:
    agendas:Agenda[] = [];

    // list of properties that the AI will perceive this object having:
    perceptionProperties:string[] = [];
    
}

