import fullscreen    from "./fullscreen.vert?raw";

import plasma        from "./plasma.frag?raw";
import tunnel        from "./tunnel.frag?raw";
import barras        from "./barras.frag?raw";
import galaxy        from "./galaxy.frag?raw";
import dualoscy      from "./dualoscy.frag?raw";
import liquidorb     from "./liquidorb.frag?raw";
import barras3d      from "./barras3d.frag?raw";
import livingorb     from "./livingorb.frag?raw";
import livingorb2    from "./livingorb2.frag?raw";
import livingorb3    from "./livingorb3.frag?raw";
import dualwaveform  from "./dualwaveform.frag?raw";
import digitalocean  from "./digitalocean.frag?raw";
import krustyrobots  from "./krustyrobots.frag?raw";
import freshquagga   from "./freshquagga.frag?raw";
import neuralsynapse   from "./neuralsynapse.frag?raw";



const shaders = [
    { name : "Plasma",       fragment : plasma       },
    { name : "Barras3d",     fragment : barras3d     },
    { name : "Barras",       fragment : barras       },
    { name : "Living Orb",   fragment : livingorb    },
    { name : "Living Orb 2", fragment : livingorb2   },
    { name : "Living Orb 3", fragment : livingorb3   },
    { name : "Galaxy",       fragment : galaxy       },
    { name : "Dual Oscy",    fragment : dualoscy     },
    { name : "Liquid Orb",   fragment : liquidorb    },
    { name : "Dual Wave",    fragment : dualwaveform },
    { name : "DigitalOcean", fragment : digitalocean },
    { name : "Tunnel",       fragment : tunnel       },
    { name : "krustyrobots", fragment : krustyrobots },
    { name : "freshquagga",  fragment : freshquagga  },
    { name : "neuralsynapse",  fragment : neuralsynapse  },
];

export default {
    fullscreen,
    shaders
};