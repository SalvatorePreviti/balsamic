#!/usr/bin/env node

import { devRunMain } from "../main";
import { typecheckProjects } from "../typecheck";

void devRunMain(typecheckProjects, "typecheck");
